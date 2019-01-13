const assert = require('assert');
const dedent = require('dedent-js');
const IndentifyLexer = require('../index');
const moo = require('moo');
const sbtest = require('@shieldsbetter/sbtest');

const baseLex = moo.compile({
    indentSource: '-->',
    indentSource2: '==>',
    blah: /\w+/,
    eol: { match: /\n/, lineBreaks: true }
});

const tests = [
    {
        label: 'formatError() passes through',
        runner: () => {
            const baseLexer = {
                formatError(token) {
                    return token;
                }
            };
            
            const lexer = new IndentifyLexer(baseLexer, {
                controlTokenRecognizer: recognizer
            });
            
            return lexer.formatError('asdf');;
        },
        assertions: formatErrorResult => {
            assert.equal('asdf', formatErrorResult);
        }
    },
    {
        label: 'save() and reset() do their jobs',
        runner: () => {
            const lexer = new IndentifyLexer(baseLex, {
                controlTokenRecognizer: recognizer
            });
            const text = dedent`
                blah-->blah
                -->blah
                -->-->blah
                
                -->blah
            `;
            
            lexer.reset(text);
            
            lexer.next();
            lexer.next();
            
            const state1 = lexer.save();
            
            lexer.next();
            lexer.next();
            
            lexer.reset(text, state1);
            
            const state2 = lexer.save();
            
            return [state1, state2];
        },
        assertions: [
            ([state1, state2]) => {
                assert.deepEqual(state1, state2, 'States not equal');
            }
        ]
    },
    {
        label: 'has() accepts base lexer tokens + special indentify tokens',
        tokens: [
            'newline', 'indent', 'dedent', 'indentSource', 'blah', 'eol'
        ],
        runner: (test) => {
            const lexer = new IndentifyLexer(baseLex, {
                controlTokenRecognizer: recognizer
            });
            
            const results = [];
            test.tokens.forEach(token => {
                results.push(lexer.has(token));
            });
            
            return results;
        },
        assertions: results => {
            results.forEach(result => {
                assert(result);
            });
        }
    },
    {
        label: 'no options no problem',
        runner: (test) => {
            new IndentifyLexer(baseLex);
        }
    }
];

function recognizer(token) {
    let result;
    
    switch (token.type) {
        case 'blah': { break; }
        case 'indentSource': 
        case 'indentSource2': {
            result = 'indent';
            break;
        }
        case 'eol': {
            result = 'newline';
            break;
        }
        default: {
            result = token.type;
            break;
        }
    }
    
    return result;
}

sbtest({
    cases: tests
});
