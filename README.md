# Nearley-Identify

Adapts existing [Nearley](https://www.npmjs.com/package/nearley)-compatible
lexers such as [moo](https://www.npmjs.com/package/moo) to emit `indent` and
`dedent` tokens in order to support indent-aware languages like Python.

## Basic Usage

```javascript
const IndentifyLexer = require('@shieldsbetter/nearley-indentify');
const moo = require('moo');

const baseLexer = moo.compile({
    ws: /[ \t]+/,
    nonws: /[^ \t\n]+/,
    newline: { match: /\n/, lineBreaks: true }
});

const indentAwareLexer = new IndentifyLexer(baseLexer);

indentAwareLexer.reset(`
    Hello World!
        Here's some
        indentation
    And dedentation
`);

let token = indentAwareLexer.next();
while (token) {
    console.log({ type: token.type, value: token.value } );
    
    token = indentAwareLexer.next();
}
```

Outputs:

```
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

Resulting lexers are themselves Nearley-compatible.  Whitespace tokens
(including newlines) are swallowed at the beginning/end of lines and replaced
with the following indentation-aware tokens types:

* `eol` indicates the end of each non-empty line.  `eol` tokens can be added for
  empty lines by adjusting `options.emptyLineStrategy`.
* `indent` indicates the beginning of a non-whitespace-only line at a deeper
  indent-level than the previous non-whitespace-only line.
* `dedent` indicates the beginning of a non-whitespace-only line at a shallower
  indent-level than the previous non-whitespace-only line.

By default, each emitted alignment token is a clone (via
[`clone`](https://www.npmjs.com/package/clone)) of the swallowed base token that triggered the alignment token, with the `value` field replaced with the full
indent string in the case of `indent`/`dedent` tokens, or preserved from the
base `"newline"`-type token in the case of `eol` tokens.  In this way, adapted
lexers attempt to support drop-in replacement with their base lexers.  Logic
that operated on the base lexer's tokens should continue to operate on the
adapted lexer's tokens.

Transformation from base tokens to adapted alignment tokens can be controlled
with `options.buildToken`.

## Options

Additional options may be passed during construction via the second constructor
argument.  For example:

```javascript
const indentAwareLexer = new IndentifyLexer(existingLexer, {
    determineIndentationLevel: (asString, tokens) => tokens.length
});
```

Available options are:

* `controlTokenRecognizer` - a `baseToken => controlTokenType` function that
  recognizes indentation and newline tokens.  The input, `baseToken`, will be a
  token as returned from the wrapped lexer, and the output, `controlTokenType`,
  should be a string value or `undefined`.  The function should return
  `"indent"` for indentation tokens, `"newline"` for newline tokens, and
  `undefined` for all other tokens.  The default function matches the base
  token's Nearley-specified `value` field against `/[ \t]+/` for an indentation
  token or `/[\n\r]+/` for a newline token, with anything else representing a
  non-control-token.
* `determineIndentationLevel` - a
  `(indentTokens, indentAsString, indentBreakingToken, previousLevel) =>
  indentLevel` function that determines the numerical indentation depth of
  a given non-empty line.
  
  The first parameter, `indentTokens`, will be an array of contiguous
  `"indent"`-type tokens as returned from the base lexer that form the
  indentation-prefix of the line.
  
  The second parameter, `indentAsString` will be the concatenation of the
  Nearley-specified `value` field of each of the tokens in `indentTokens`; i.e.:
  `indentTokens.map(t => t.value).reduce((accum, val) => accum + val, '')`.
  
  The third parameter, `indentBreakingToken` will be the first non-indent token
  of the line.
  
  The fourth parameter, `previousLevel` will be a number indicating the
  indentation level of the previous non-empty line (and thus our currrent
  operating depth) as we parse this line, or `undefined` if we're encountering
  the first non-empty line and no indentation depth has yet been established.
  This can be useful when one wishes to ignore the actual indent prefix of the
  line and instead "force" the line to exist at a deeper, shallower, or the same
  level relative to the current operating level, as for example if comment lines
  should always exist at the current indent level regardless of their actual
  indentation.
  
  The return value should be a number representing the depth of the indent of
  the line.  Indent levels need not be integers nor contiguous.  The only
  requirements are that equivalent levels of indent yield the same number,
  "deeper" levels of indent yield numbers greater than "shallower" levels, and
  "shallower" levels of indent yield numbers less than "deeper" levels.
* `emptyLineStrategy` - a `(newlineToken, emit) => {}` strategy to be executed
  upon encountering an empty line.  `newlineToken` will be the base token as
  returned from the wrapped lexer that triggered the end of line, or
  `undefined` if the end of line was triggered because the end of the stream was
  reached.  The provided `emit(token)` function may be called to add tokens into
  the indent-aware lexer's stream to represent the empty line.  The default
  value is `() => {}`, which emits no tokens when encountering an empty line.
  Any returned value will be ignored.
* `lineListeners` - an array of `(indentTokens, indentAsString,
  indentBreakingToken, indentBreakingTokenType) => {}` strategies to be executed
  after the full indent prefix of each line is parsed but before the token that
  broke the indent prefix is emitted.  This can be useful, for example, to check
  that indent strings use consistent indent characters (indeed, the default
  provides this functionality).
  
  `indentTokens` and `indentAsString` will reflect the line's indent prefix as
  described for the `determineIndentationLevel` option.
  
  `indentBreakingToken` will be the non-indent token that broke the indent
  prefix, which may be a `"newline"`-type token if the line is blank, or
  `undefined` if the indent prefix was broken by the end of the base token
  stream.
  
  `indentBreakingTokenType` will be the token type as returned from
  `options.controlTokenRecognizer()` of `indentBreakingToken`, or `undefined` if
  `indentBreakingToken` is itself `undefined`.
  
  Any returned value will be ignored.
  
  The default is `[ new IndentifyLexer.ConsistentIndentEnforcer() ]`, which
  ensures that the shared prefix of characters forming the indent from line to
  line does not change and raises an `Error` if it does.
* `tokenBuilder` - a transformation function from base token to derived
  alignement tokens, of the form `(type, value, baseToken) => alignmentToken`.
  `type` will be the desired type of the derived token as a string (one of
  `"indent"`, `"dedent"`, or `"newline"`).  `value` will be desired
  Nearley-specified `value` field of the derived token.  `baseToken` will be the
  base token as returned from the wrapped lexer that triggered the requested
  alignment token.  The return value should be the specified alignment token,
  ready to be emitted into the token stream.  The default is:
  
  ```javascript
  (type, value, baseToken) => {
      const token = clone(baseToken);
      token.type = type;
      token.value = value;
      return token;
  }
  ```
  
  Where `clone()` is [`clone`](https://www.npmjs.com/package/clone).
