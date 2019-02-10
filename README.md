# Nearley-Identify [![codecov](https://codecov.io/gh/hamptonsmith/nearley-indentify/branch/master/graph/badge.svg)](https://codecov.io/gh/hamptonsmith/nearley-indentify) [![Build Status](https://travis-ci.org/hamptonsmith/nearley-indentify.svg?branch=master)](https://travis-ci.org/hamptonsmith/nearley-indentify)

Adapts existing [Nearley](https://www.npmjs.com/package/nearley)-compatible
lexers such as [moo](https://www.npmjs.com/package/moo) to emit `indent` and
`dedent` tokens in order to support indent-aware languages like Python.

## Basic Usage

```javascript
const IndentifyLexer = require("@shieldsbetter/nearley-indentify");

const indentAwareLexer = new IndentifyLexer(mooLexer());

indentAwareLexer.reset(`
    Hello World!
        Here's some
        indentation
    And dedentation
`);

let token = indentAwareLexer.next();
while (token) {
  console.log({ type: token.type, value: token.value });

  token = indentAwareLexer.next();
}

function mooLexer() {
  return require("moo").compile({
    ws: /[ \t]+/,
    nonws: /[^ \t\n]+/,
    newline: { match: /\n/, lineBreaks: true }
  });
}
```

Outputs:

```javascript
{ type: 'nonws', value: 'Hello' }
{ type: 'ws', value: ' ' }
{ type: 'nonws', value: 'World!' }
{ type: 'eol', value: '\n' }
{ type: 'indent', value: '        ' }
{ type: 'nonws', value: 'Here\'s' }
{ type: 'ws', value: ' ' }
{ type: 'nonws', value: 'some' }
{ type: 'eol', value: '\n' }
{ type: 'nonws', value: 'indentation' }
{ type: 'eol', value: '\n' }
{ type: 'dedent', value: '    ' }
{ type: 'nonws', value: 'And' }
{ type: 'ws', value: ' ' }
{ type: 'nonws', value: 'dedentation' }
{ type: 'eol', value: '\n' }
```

## Detailed Operation

Resulting lexers are themselves Nearley-compatible. Input is provided by a call
to `reset()`, and tokens are read by repeatedly calling `next()` until it
returns `undefined`. Generated alignment tokens can be recognized by having a
`type` field equal to `indent`, `dedent`, or `eol`. All other tokens will be as
they were produced by the base lexer.

To fully understand available options, it's important to understand the parsing
algorithm, which is as follows:

1. Tokens from the base lexer are categorized by
   `options.controlTokenRecognizer` as "newline"-type tokens, "indent"-type
   tokens, or neither.
2. The base tokens are then conceptually partitioned into lines, each terminated
   by one of the "newline"-type base tokens, plus one line terminated by the end
   of the stream. There will thus always be `(n + 1)` conceptual lines, where
   `n` is the number of "newline"-type base tokens.
3. Each line is then itself conceptually partitioned into an _indent prefix_,
   which is a (possibly-empty) list of "indent"-type base tokens that appear
   before any non-"indent"-type base token, and the line's _content_, which is a
   (possibly-empty) list of non-"newline"-type base tokens that fall after the
   indent prefix but before the "newline"-type base token or end of stream that
   terminates the conceptual line. The terminating "newline"-type base token (if
   any) is discarded.
4. For each conceptual line in sequence,

5. If the line's content is empty, we call `options.emptyLineStrategy()` and
   take no further action. By default, this means no tokens are emitted by the
   indentified lexer and the parser's internal indent level is not changed.
6. Otherwise, with a non-empty content, `options.determineIndentationLevel()`
   will be used to assign a numeric indentation level to the indent prefix,
   then:
   7. If no internal indent level has been established, or the numeric
      indentation level is equal to the established level, the internal indent
      level will be set to the newly calculated level, then the indentified
      lexer will simply begin emitting the content of the line, followed by an
      `eol` token as built by `options.buildToken()`.
   8. Otherwise, we emit an `indent` token or `dedent` token as built by
      `options.buildToken()` (for larger indent levels or smaller indent levels,
      respectively), then set the internal indent level to the new level. Then,
      we emit the content of the line, followed by an `eol`.

## Required Base Lexer Interface

Base lexers should conform to the
[interace expected by Nearley](https://nearley.js.org/docs/tokenizers#custom-lexers).
Nearley doesn't fully specify how token streams are terminated, but we assume
moo-like behavior and specify that wrapped lexers must return `undefined` from
`next()` when there are no further tokens.

Tokens from the `next()` method of the base lexer must objects with the
Nearley-specified `value` field, but there are no other requirements under the
default configuration. If custom `options.controlTokenRecognizer()` or
`options.buildToken()` functions are specified, tokens must additionally be
acceptable to them. The default control token recognizer requires only a `value`
field and the default token builder requires only that base tokens are objects.

## Options

Additional options may be passed during construction via the second constructor
argument. For example:

```javascript
const indentAwareLexer = new IndentifyLexer(existingLexer, {
  determineIndentationLevel: (asString, tokens) => tokens.length
});
```

Available options are:

- `controlTokenRecognizer` - a `baseToken => controlTokenType` function that
  partitions base tokens into categories.

The input, `baseToken`, will be a token as returned from the wrapped lexer, and
the output, `controlTokenType` should be a string value or `undefined`. The
function should return `"indent"` for indentation tokens, `"newline"` for
newline tokens, and `undefined` for all other tokens.

The default function categorizes base token's with a `value` field match
`/[ \t]+/` as "indent"-type, matching `/[\n\r]+/` as "newline"-type, and
anything else as neither.

- `determineIndentationLevel` - a
  `(indentTokens, indentAsString, indentBreakingToken, previousLevel) => indentLevel`
  function that determines the numerical indentation depth of a given non-empty
  line.

The first parameter, `indentTokens`, will be the _indent prefix_ of the line,
i.e. an array of contiguous `"indent"`-type base lexer tokens that were
encountered before the first non-"indent"-type token of the line.

The second parameter, `indentAsString`, will be the concatenation of the `value`
field of each of the tokens in `indentTokens`; i.e.: the result of
`indentTokens.map(t => t.value).reduce((accum, val) => accum + val, '')`.

The third parameter, `indentBreakingToken`, will be the first non-"indent"-type
token of the line.

The fourth parameter, `previousLevel`, will be a number indicating the parser's
currently established indentation level, or `undefined` if no indentation depth
has yet been established. This can be useful when one wishes to ignore the
actual indent prefix of the line and instead "force" the line to exist at a
particular level relative to the current indentation level. For example, one may
wish to have comment lines always exist at the previously established level,
irrespective of their indent level.

The return value should be a number representing the depth of the indent of the
line. Indent levels need not be integers nor contiguous. The only requirements
are that equivalent levels of indent yield the same number, "deeper" levels of
indent yield numbers greater than "shallower" levels, and "shallower" levels of
indent yield numbers less than "deeper" levels.

- `emptyLineStrategy` - a `(newlineToken, emit) => {}` strategy to be executed
  upon encountering a line consisting of only zero or more "indent"-type base
  tokens and no content.

The first parameter, `newlineToken`, will be the "newline"-type base token that
triggered the end of the conceptual line, or `undefined` if the end of line was
triggered because the end of the stream was reached.

The second parameter, `emit`, is a function that may be called to add tokens
into the indent-aware lexer's stream. This can be useful, for example, when
you'd like empty lines to get their own `eol`-type token.

The default value is `() => {}`, which emits no tokens when encountering an
empty line.

Any returned value will be ignored.

- `lineListeners` - an array of
  `(indentTokens, indentAsString, indentBreakingToken, indentBreakingTokenType) => {}`
  strategies to be executed after the full indent prefix of each line is parsed
  but before the token that broke the indent prefix is emitted.

This can be useful, for example, to check that indent strings use consistent
indent characters (indeed, the default provides this functionality).

The first and second parameters, `indentTokens` and `indentAsString`, will
reflect the line's indent prefix as described for the
`determineIndentationLevel` option.

The third parameter, `indentBreakingToken`, will be the non-indent token that
broke the indent prefix, which may be a `"newline"`-type token if the line is
blank, or `undefined` if the indent prefix was broken by the end of the base
token stream.

The fourth parameter, `indentBreakingTokenType`, will be the result of applying
`options.controlTokenRecognizer()` to `indentBreakingToken`, or `undefined` if
`indentBreakingToken` is itself `undefined`.

Any returned value will be ignored.

The default is `[ new IndentifyLexer.ConsistentIndentEnforcer() ]`, which
ensures that the shared prefix of characters forming the indent from line to
line does not change and raises an `Error` if it does.

- `tokenBuilder` - a transformation function from a base token to a derived
  alignment token, of the form `(type, value, baseToken) => alignmentToken`.

The first parameter, `type`, will be a string representing the intended type of
the derived token (one of `"indent"`, `"dedent"`, or `"newline"`). `value` will
be the concatenated `value` fields of the base tokens that were swallowed to be
transformed into the alignment token being requested.

The return value should be the requested alignment token, ready to be emitted
into the token stream. Nearley-Indentify performs no further processing on these
returned tokens and they are unconstrained other than the need to be acceptable
to the token consumer.

The default is:

```javascript
(type, value, baseToken) => {
  const token = clone(baseToken);
  token.type = type;
  token.value = value;
  return token;
};
```

Where `clone()` is [clone](https://www.npmjs.com/package/clone)`clone`.

## Extras

- `IndentifyLexer.ConsistentIndentEnforcer` - a line listeners, suitable to
  provide to `options.lineListeners`, that enforces consistent indentation
  between lines.

"Consistent" here means that the string indent prefix of contiguous non-empty
lines at the same numerical indent level are the same string, the indent prefix
of indented non-empty lines are prefixed by the indent prefix of the previous
less-indented non-empty line, and the indent prefix of dedented non-empty lines
forms a prefix of the indent prefix of the previous more-indented non-empty
line.
