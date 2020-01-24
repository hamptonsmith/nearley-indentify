# Nearley-Indentify [![codecov](https://codecov.io/gh/hamptonsmith/nearley-indentify/branch/master/graph/badge.svg)](https://codecov.io/gh/hamptonsmith/nearley-indentify) [![Build Status](https://travis-ci.org/hamptonsmith/nearley-indentify.svg?branch=master)](https://travis-ci.org/hamptonsmith/nearley-indentify)

Adapts existing [Nearley](https://www.npmjs.com/package/nearley)-compatible
lexers such as [moo](https://www.npmjs.com/package/moo) to emit `indent` and
`dedent` tokens in order to support indent-aware languages like Python.

## Quickstart

```javascript
const IndentifyLexer = require("@shieldsbetter/nearley-indentify");

const indentifiedLexer = new IndentifyLexer(mooLexer());

indentifiedLexer.reset(`
    Hello World!
        Here's some
        indentation
    And dedentation
`);

let token = indentifiedLexer.next();
while (token) {
  console.log({ type: token.type, value: token.value });

  token = indentifiedLexer.next();
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

## Overview

Indentified lexers are themselves Nearley-compatible. Input is provided by a
call to `reset()`, and tokens are read by repeatedly calling `next()` until it
returns `undefined`. By default, generated indentation-related tokens can be
recognized by having a `type` field equal to `"indent"`, `"dedent"`, or `"eol"`.
All other tokens will be as they were produced by the base lexer.

The default options require only that base tokens have the single
Nearley-required `value` field, but more advanced customization can rely on
additional implementation-specific realities of the base tokens.

## Options

Additional options may be passed during construction via the second constructor
argument. For example:

```javascript
const indentifiedLexer = new IndentifyLexer(baseLexer, {
  determineIndentationLevel: (asString, tokens) => tokens.length
});
```

Available options are:

- `controlTokenRecognizer` - a function that classifies tokens from the base
  lexer according to their relevance to indentation parsing. This function
  should take the form `baseToken => controlTokenType`, where `baseToken` will
  be a token from the base lexer, and `controlTokenType` should be a string from
  the set {`"indent"`, `"newline"`}, or `undefined` if the given base token has
  no relevance to indentation parsing.
  
  The default function is:
  
  ```javascript
  baseToken => {
    let result;
    if (/[ \t]+/.test(baseToken.value)) {
      result = 'indent';
    } else if (/[\n\r]+/.test(baseToken.value)) {
      result = 'newline';
    }
    return result;
  }
  ```
  
- `determineIndentationDepth` - assigns a numeric indentation depth to a line of
  input, as delimited by `"newline"`-type tokens or the end of the base token
  stream.  Only lines that contain non-`"indent"`, non-`"newline"` tokens will
  be passed to this function.
  
  This numeric depth need not be integral nor contiguous. The only
  requirements are that equivalent levels of indent yield the same number,
  "deeper" levels of indent yield numbers greater than "shallower" levels, and
  "shallower" levels of indent yield numbers less than "deeper" levels.
  
  This function should take the form
  `(indentTokens, indentAsString, indentBreakingToken, previousDepth) => depth`.

  The first parameter, `indentTokens`, will be the _indent prefix_ of the line,
  i.e. an array of contiguous `"indent"`-type base lexer tokens that began the
  line and preceded first non-`"indent"`-type token of the line.  This array
  could be empty for lines with no indentation.

  The second parameter, `indentAsString`, will be the concatenation of the
  `value` field of each of the tokens in `indentTokens`; i.e.: the result of
  `indentTokens.map(t => t.value).join('')`.

  The third parameter, `indentBreakingToken`, will be the first
  non-`"indent"`-type base token of the line.

  The fourth parameter, `previousDepth`, will be a number indicating the
  parser's currently established indentation depth, or `undefined` if no
  indentation depth has yet been established. This parameter can be useful when
  one wishes to ignore the actual indent prefix of the line and instead "force"
  the line to exist at a particular depth relative to the current indentation
  depth. For example, one may wish to have comment lines always exist at the
  previously established depth, irrespective of their actual indent prefix.
  
- `emptyLineStrategy` - a `(newlineToken, emit) => {}` function to be executed
  upon encountering a line consisting of only zero or more `"indent"`-type base
  tokens followed by a `"newline"`-type token or the end of the base token input
  stream.

  The first parameter, `newlineToken`, will be the `"newline"`-type base token
  that ended the line, or `undefined` if the line was ended by the end of the
  base token stream.
  
  The second parameter, `emit`, is a function that takes a single parameter
  value and emits it as a token into the indentified lexer's stream. This can be
  useful, for example, when you'd like empty lines to get their own `eol`-type
  token. These tokens will be emitted exactly as provided.

  The default value is `() => {}`, which emits no tokens when encountering an
  empty line.

  Any returned value will be ignored.

- `lineListeners` - an array of
  `(indentTokens, indentAsString, indentBreakingToken, indentBreakingTokenType) => {}`
  functions to be executed after the full indent prefix of each line is parsed
  but before the token that broke the indent prefix is emitted.  Each listener
  will be called for each line, including empty lines.

  This can be useful, for example, to check that indent prefixes use consistent
  indent characters (indeed, the default provides this functionality).

  The first and second parameters, `indentTokens` and `indentAsString`, will
  reflect the line's indent prefix as described for the
  `determineIndentationDepth` option.

  The third parameter, `indentBreakingToken`, will be the non-`"indent"` token
  that broke the indent prefix, which may be a content token, a `"newline"`-type
  token, or `undefined` if the indent prefix was broken by the end of the base
  token stream.

  The fourth parameter, `indentBreakingTokenType`, will be the result of
  applying `options.controlTokenRecognizer()` to `indentBreakingToken`, or
  `undefined` if `indentBreakingToken` is itself `undefined`.

  Any returned value will be ignored.

  The default is `[ new IndentifyLexer.ConsistentIndentEnforcer() ]`, which
  ensures that the shared prefix of characters forming the indent from line to
  line does not change and raises an `Error` if it does.

- `tokenBuilder` - a function for constructing `"indent"`, `"dedent"`, and
  `"newline"` alignment tokens to be inserted into the indentified stream.
  Takes the form `(type, value, baseToken) => alignmentToken`.

  The first parameter, `type`, will be a string indicating the requested type of
  token (one of `"indent"`, `"dedent"`, or `"eol"`). 
  
  The second parmaeter, `value`, will be one of the following:
  
  - If `type === 'eol'`, `value` is the `value` field of the base token that
    triggered the end of the line.
  - If `type === 'indent'`, `value` is the concatenation of the `value` fields
    of each of the tokens that forms the indent prefix of the line whose content
    tokens will follow the constructed `indent` token.
  - If `type === 'dedent'`, `value` is either the concatenation of the `value`
    fields of each of the tokens that forms the indent prefix of the line whose
    content tokens will follow the constructed `dedent` token, or, in the case
    of a `dedent` token being constructed for an intermediate indentation level
    (which will be followed by another `dedent` token or the end of the stream
    rather than the content tokens of some line), `value` is the concatenation
    of the `value` fields of the tokens that formed the indent prefix of the
    line that originally established the intermediate indentation level.
  
  The third parameter, `baseToken` will be some base token to be used as a
  template to form the constructed alignment token.  More specifically:
  
  - If `type === 'eol'`, `baseToken` will be the `"newline"`-type base token
    that triggered the end of the line.
  - If `type === 'indent'`, `baseToken` will be the indent-breaking token of
    the line whose content tokens will follow the constructed `"indent"` token.
  - If `type === 'dedent'`, `baseToken` will be the indent-breaking token of the
    line whose content tokens will follow the constructed `"dedent"` token, or,
    in the case of a `dedent` token being constructed for an intermediate
    indentation level (which will be followed by another `dedent` token or the
    end of the stream rather than the content tokens of some line), `baseToken`
    will be the `"newline"`-type base token that preceded the dedented line.
    
  The return value should be the requested alignment token, ready to be emitted
  into the token stream. Nearley-Indentify performs no further processing on
  these returned tokens and they are unconstrained other than the need to be
  acceptable to the token consumer.

  The default is:

  ```javascript
  (type, value, baseToken) => {
    const token = clone(baseToken);
    token.type = type;
    token.value = value;
    return token;
  };
  ```

  Where `clone()` is [`clone`](https://www.npmjs.com/package/clone).

## Required Base Lexer Interface

Base lexers should conform to the
[interface expected by Nearley](https://nearley.js.org/docs/tokenizers#custom-lexers).
Nearley doesn't fully specify how token streams are terminated, but we assume
moo-like behavior and specify that wrapped lexers must return `undefined` from
`next()` when there are no further tokens.

Tokens from the `next()` method of the base lexer must be objects with the
Nearley-specified `value` field, but there are no other requirements under the
default configuration. If custom `options.controlTokenRecognizer()` or
`options.buildToken()` functions are specified, tokens must additionally be
acceptable to them. The default control token recognizer requires only a `value`
field and the default token builder requires only that base tokens are objects.

## Extras

- `IndentifyLexer.ConsistentIndentEnforcer` - a line listener, suitable to
  provide to `options.lineListeners`, that enforces consistent indentation
  between lines.

  "Consistent" here means that the string indent prefix of contiguous non-empty
  lines at the same numerical indent level are the same string, the indent
  prefix of indented non-empty lines are prefixed by the indent prefix of the
  previous less-indented non-empty line, and the indent prefix of dedented
  non-empty lines forms a prefix of the indent prefix of the previous
  more-indented non-empty line.
