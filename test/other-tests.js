const assert = require("assert");
const dedent = require("dedent-js");
const IndentifyLexer = require("../index");
const moo = require("moo");
const sbtest = require("@shieldsbetter/sbtest");

const baseLex = moo.compile({
    indentSource: "-->",
    indentSource2: "==>",
    blah: /\w+/,
    eol: {
        match: /\n/,
        lineBreaks: true
    }
});

const tests = [
    {
        label: "formatError() passes through",
        runner: () => {
            const baseLexer = {
                formatError(token) {
                    return token;
                }
            };

            const lexer = new IndentifyLexer(baseLexer, {
                controlTokenRecognizer: recognizer
            });

            return lexer.formatError("asdf");
        },
        assertions: formatErrorResult => {
            assert.equal("asdf", formatErrorResult);
        }
    },
    {
        label: "save() and reset() do their jobs",
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
                assert.deepEqual(state1, state2, "States not equal");
            }
        ]
    },
    {
        label: "has() accepts base lexer tokens + special indentify tokens",
        tokens: ["newline", "indent", "dedent", "indentSource", "blah", "eol"],
        runner: test => {
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
        label: "no options no problem",
        runner: test => {
            new IndentifyLexer(baseLex);
        }
    },
    {
        label: "line listener",
        runner: () => {
            const results = [];
            const ll = {
                onLine() {
                    results.push(Array.prototype.slice.call(arguments));
                }
            };

            const lexer = new IndentifyLexer(baseLex, {
                lineListeners: [ll],
                controlTokenRecognizer: recognizer
            });
            const text = dedent`
                blah-->blah
                -->blah
                -->-->blah
                -->
                -->blah
                
                blah
                
            `;

            lexer.reset(text);

            let token = lexer.next();
            while (token !== undefined) {
                token = lexer.next();
            }

            return results;
        },
        assertions: [
            ([...calls]) => {
                const expectedValues = [
                    [[], "", "blah", undefined],
                    [["-->"], "-->", "blah", undefined],
                    [["-->", "-->"], "-->-->", "blah", undefined],
                    [["-->"], "-->", "\n", "newline"],
                    [["-->"], "-->", "blah", undefined],
                    [[], "", "\n", "newline"],
                    [[], "", "blah", undefined],
                    [[], "", undefined, undefined]
                ];

                assert.equal(
                    calls.length,
                    expectedValues.length,
                    "onLine() call count"
                );

                for (let i = 0; i < expectedValues.length; i++) {
                    for (let j = 0; j < expectedValues[i][0].length; j++) {
                        assert.equal(
                            calls[i][0][j].value,
                            expectedValues[i][0][j],
                            `line ${i} indent token ${j} incorrect`
                        );
                    }

                    assert.equal(
                        calls[i][1],
                        expectedValues[i][1],
                        `line ${i} token string incorrect`
                    );

                    if (expectedValues[i][2] === undefined) {
                        assert.equal(
                            calls[i][2],
                            undefined,
                            `line ${i} breaking token not undefined`
                        );
                    } else {
                        assert.equal(
                            calls[i][2].value,
                            expectedValues[i][2],
                            `line ${i} breaking token incorrect`
                        );
                    }

                    assert.equal(
                        calls[i][3],
                        expectedValues[i][3],
                        `line ${i} breaking token type incorrect`
                    );
                }
            }
        ]
    },
    {
        label: "ConsistentIndentEnforcer normal indent",
        runner: () => {
            const enforcer = new IndentifyLexer.ConsistentIndentEnforcer();
            enforcer.onLine(
                [
                    {
                        value: "abc"
                    }
                ],
                "abc",
                "something",
                undefined
            );
            enforcer.onLine(
                [
                    {
                        value: "abcd"
                    }
                ],
                "abcd",
                "something",
                undefined
            );
        }
    },
    {
        label: "ConsistentIndentEnforcer normal dedent",
        runner: () => {
            const enforcer = new IndentifyLexer.ConsistentIndentEnforcer();
            enforcer.onLine(
                [
                    {
                        value: "abc"
                    }
                ],
                "abc",
                "something",
                undefined
            );
            enforcer.onLine(
                [
                    {
                        value: "ab"
                    }
                ],
                "ab",
                "something",
                undefined
            );
        }
    },
    {
        label: "ConsistentIndentEnforcer normal same-dent",
        runner: () => {
            const enforcer = new IndentifyLexer.ConsistentIndentEnforcer();
            enforcer.onLine(
                [
                    {
                        value: "abc"
                    }
                ],
                "abc",
                "something",
                undefined
            );
            enforcer.onLine(
                [
                    {
                        value: "abc"
                    }
                ],
                "abc",
                "something",
                undefined
            );
        }
    },
    {
        label: "ConsistentIndentEnforcer indent doesn't have prefix",
        runner: () => {
            const enforcer = new IndentifyLexer.ConsistentIndentEnforcer();
            enforcer.onLine(
                [
                    {
                        value: "abc"
                    }
                ],
                "abc",
                "something",
                undefined
            );
            enforcer.onLine(
                [
                    {
                        value: "abxd"
                    }
                ],
                "abxd",
                "something",
                undefined
            );
        },
        errorAssertions: [errorWithMessageIncluding("inconsistent")]
    },
    {
        label: "ConsistentIndentEnforcer dedent doesn't have prefix",
        runner: () => {
            const enforcer = new IndentifyLexer.ConsistentIndentEnforcer();
            enforcer.onLine(
                [
                    {
                        value: "abc"
                    }
                ],
                "abc",
                "something",
                undefined
            );
            enforcer.onLine(
                [
                    {
                        value: "ax"
                    }
                ],
                "ax",
                "something",
                undefined
            );
        },
        errorAssertions: [errorWithMessageIncluding("inconsistent")]
    },
    {
        label: "ConsistentIndentEnforcer same-dent not the same",
        runner: () => {
            const enforcer = new IndentifyLexer.ConsistentIndentEnforcer();
            enforcer.onLine(
                [
                    {
                        value: "abc"
                    }
                ],
                "abc",
                "something",
                undefined
            );
            enforcer.onLine(
                [
                    {
                        value: "abd"
                    }
                ],
                "abd",
                "something",
                undefined
            );
        },
        errorAssertions: [errorWithMessageIncluding("inconsistent")]
    }
];

function errorWithMessageIncluding(text) {
    return e => {
        if (!e.message.toLowerCase().includes(text)) {
            throw new assert.AssertionError({
                message: `Error message did not include "${text}".`,
                expected: "text",
                actual: e.message
            });
        }
    };
}

function recognizer(token) {
    let result;

    switch (token.type) {
        case "blah": {
            break;
        }
        case "indentSource":
        case "indentSource2": {
            result = "indent";
            break;
        }
        case "eol": {
            result = "newline";
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
