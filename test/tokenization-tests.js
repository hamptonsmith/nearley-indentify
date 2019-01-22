const sbtest = require('@shieldsbetter/sbtest');

const assert = require('assert');
const dedent = require('dedent-js');
const IndentifyLexer = require('../index');
const moo = require('moo');

const baseLex = moo.compile({
    indentSource: '-->',
    indentSource2: '==>',
    blah: /\w+/,
    newline: { match: /\n/, lineBreaks: true }
});

const testCases = [
    {
        label: 'no tokens (default empty line strategy)',
        input: ``,
        output: ``
    },
    {
        label: 'internal indents passed along',
        input: `
            blah-->blah-->blah
        `,
        output: `
            blah indentSource blah indentSource blah eol
        `
    },
    {
        label: 'basic indent',
        input: `
            blah-->blah
            -->blah-->blah
            -->blah
            blah
        `,
        output: `
            blah indentSource blah eol
            indent blah indentSource blah eol
            blah eol
            dedent blah eol
        `
    },
    {
        label: 'multiple indent tokens are one indent',
        input: `
            blah
            -->-->blah
            blah
        `,
        output: `
            blah eol
            indent blah eol
            dedent blah eol
        `
    },
    {
        label: 'multiple indent levels',
        input: `
            blah
            -->blah
            -->-->blah
            -->blah
            blah
        `,
        output: `
            blah eol
            indent blah eol
            indent blah eol
            dedent blah eol
            dedent blah eol
        `
    },
    {
        label: 'dedent through multiple levels',
        input: `
            blah
            -->blah
            -->-->blah
            blah
        `,
        output: `
            blah eol
            indent blah eol
            indent blah eol
            dedent dedent blah eol
        `
    },
    {
        label: 'auto-dedent at end',
        input: `
            blah
            -->blah
            -->-->blah
        `,
        output: `
            blah eol
            indent blah eol
            indent blah eol
            dedent dedent
        `
    },
    {
        label: 'empty lines belong to last block',
        input: `
            blah
            -->-->-->blah
            -->-->-->
            -->-->
            -->-->-->-->
            
            blah
        `,
        output: `
            blah eol
            indent blah eol
            dedent blah eol
        `
    },
    {
        label: 'whitespace final line gets no eol (default empty line strat)',
        input: `
            blah
            -->
        `,
        output: `
            blah eol
        `
    },
    {
        label: 'empty final line gets no eol (default empty line strat)',
        input: `
            blah
            
        `,
        output: `
            blah eol
        `
    },
    {
        label: 'custom empty line strategy',
        input: `
            blah
            
            blah
            
        `,
        emptyLineStrategy: (token, emit) => {
            emit({ type: 'eol' });
        },
        output: `
            blah eol
            eol
            blah eol
            eol
        `
    },
    {
        label: 'bad control token type',
        baseLex: moo.compile({
            weird: /\w+/,
            space: ' '
        }),
        input: `blah blah`,
        errorAssertions: errorWithMessageIncluding('unknown type')
    },
    {
        label: 'dedent to inconsistent level',
        input: `
            blah
            -->-->blah
            -->blah
        `,
        errorAssertions: errorWithMessageIncluding('inconsistent')
    },
    {
        label: 'dedent with inconsistent indent prefix',
        input: `
            -->blah
            -->-->blah
            ==>blah
        `,
        errorAssertions: errorWithMessageIncluding('inconsistent')
    },
    {
        label: 'indent with inconsistent indent prefix',
        input: `
            -->blah
            ==>-->blah
        `,
        errorAssertions: errorWithMessageIncluding('inconsistent')
    },
    {
        label: 'newline with inconsistent indent prefix',
        input: `
            -->blah
            ==>blah
        `,
        errorAssertions: errorWithMessageIncluding('inconsistent')
    },
    {
        label: 'default control token recognizer',
        controlTokenRecognizer: undefined,
        baseLex: moo.compile({
            word: /\w+/,
            space: /[ \t]+/,
            eol: { match: /[\n\r]+/, lineBreaks: true }
        }),
        input: `
            words words
                words
            words
        `,
        output: `
            word space word eol
            indent word eol
            dedent word eol
        `
    }
];

sbtest({
    cases: testCases,
    transformer: test => {
        if ('output' in test) {
            test.assertions = test.assertions || [];

            let expected;
            let check;

            if (typeof test.output === 'string') {
                expected = test.output.trim().split(/[ \n]+/);
                if (expected[0] === '') {
                    expected = [];
                }
                
                check = (token, expectation) => {
                    assert.equal(token.type, expectation);
                };
            }
            else {
                expected = test.output;
                
                check = (token, expectation) => {
                    assert.deepEqual(token, expectation);
                }
            }

            test.assertions.push(results => {
                for (let i = 0; i < expected.length; i++) {
                    if (i >= results.length) {
                        throw new assert.AssertionError({
                            message: 'Expected another token, but found none.',
                            expected: expected[i]
                        });
                    }
                    
                    check(results[i], expected[i]);
                }
                
                if (results.length > expected.length) {
                    throw new assert.AssertionError({
                        message:
                                'Expected end of stream but got another token.',
                        actual: results[expected.length]
                    });
                }
            });
        }
    },
    runner: test => {
        const dedentedTestInput = dedent(test.input);
        const lexer = new IndentifyLexer(test.baseLex || baseLex,
                {
                    controlTokenRecognizer: ('controlTokenRecognizer' in test) ?
                            test.controlTokenRecognizer : recognizer,
                    emptyLineStrategy: test.emptyLineStrategy
                });
        
        lexer.reset(dedentedTestInput);
        
        const results = [];
        let token = lexer.next();
        while (token !== undefined) {
            results.push(token);
            token = lexer.next();
        }
        
        return results;
    }
});

function recognizer(token) {
    let result;
    
    switch (token.type) {
        case 'blah': { break; }
        case 'indentSource': 
        case 'indentSource2': {
            result = 'indent';
            break;
        }
        case 'newline': {
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

function errorWithMessageIncluding(text) {
    return e => {
        if (!e.message.toLowerCase().includes(text)) {
            throw new assert.AssertionError({
                message: `Error message did not include "${text}".`,
                expected: 'text',
                actual: e.message
            });
        }
    };
}

