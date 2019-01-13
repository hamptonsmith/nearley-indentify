'use strict';

const clone = require('clone');

module.exports = class {
    constructor(nearleyLexer, options) {
        let {
            controlTokenRecognizer,
            defaultToken,
            tokenBuilder
        } = (options || {});
        
        if (defaultToken !== undefined) {
            this.defaultToken = defaultToken;
        }
        else {
            this.defaultToken = {
                value: '',
                text: '',
                line: 1,
                col: 1,
                offset: 0
            };
        }
        
        this.tokenBuilder = tokenBuilder || ((type, value, base) => {
            const token = clone(base);
            token.type = type;
            token.value = value;
            return token;
        });
        
        controlTokenRecognizer =
                controlTokenRecognizer || defaultControlTokenRecognizer;
        
        // For our convenience, we want to be able to safely call this with
        // undefined and just have it return undefined in that case, but we
        // don't want to trouble our client with that detail.
        this.controlTokenRecognizer = token => {
            let result;
            
            if (token !== undefined) {
                result = controlTokenRecognizer(token);
            }
            
            return result;
        };
        
        this.baseLexer = nearleyLexer;
        this.indentStack = [];
        this.tokenQueue = [];
        this.beginningOfLine = true;
    }
    
    next() {
        if (this.tokenQueue.length === 0) {
            this.readyMoreTokens();
        }
        
        let result;
        if (this.tokenQueue.length !== 0) {
            result = this.tokenQueue.shift();
        }
        
        return result;
    }
    
    save() {
        return {
            baseState: this.baseLexer.save(),
            indentStack: this.indentStack.slice(),
            tokenQueue: this.tokenQueue.slice(),
            beginningOfLine: this.beginningOfLine,
            lastRealToken: this.lastRealToken,
            done: this.done
        };
    }
    
    reset(chunk, info) {
        info = info || {
            baseState: undefined,
            indentStack: [],
            tokenQueue: [],
            beginningOfLine: true,
            lastRealToken: undefined,
            done: false
        };
    
        this.baseLexer.reset(chunk, info.baseState);
        
        this.indentStack = info.indentStack;
        this.tokenQueue = info.tokenQueue;
        this.beginningOfLine = info.beginningOfLine;
        this.lastRealToken = info.lastRealToken;
        this.done = info.done;
    }
    
    formatError(token, message) {
        return this.baseLexer.formatError(token, message);
    }
    
    has(name) {
        return name === 'eol' || name === 'indent' || name === 'dedent' ||
                this.baseLexer.has(name);
    }
    
    readyMoreTokens() {
        let latestToken = this.baseLexer.next();
        
        if (latestToken) {
            this.lastRealToken = latestToken;
        }
        
        let controlTokenType = this.controlTokenRecognizer(latestToken);
    
        let curIndent = '';
        while (latestToken !== undefined && controlTokenType !== undefined) {
            switch (controlTokenType) {
                case 'indent': {
                    if (this.beginningOfLine) {
                        curIndent += latestToken.value;
                    }
                    else {
                        // Indent token in the middle of a line.  Not
                        // interesting to us--emit it along to the client.
                        this.tokenQueue.push(latestToken);
                    }
                
                    break;
                }
                case 'newline': {
                    this.tokenQueue.push(this.tokenBuilder(
                            'eol', latestToken.value, latestToken));
                    
                    this.beginningOfLine = true;
                    curIndent = '';
                    
                    break;
                }
                default: {
                    throw new Error('controlTokenRecognizer() returned an ' +
                            'unknown type.  Must be undefined, "indent", or ' +
                            '"newline".  Was: ' + controlTokenType + '.  ' +
                            'Failed on token: ' + JSON.stringify(latestToken) +
                            '.');
                }
            }
            
            latestToken = this.baseLexer.next();
            controlTokenType = this.controlTokenRecognizer(latestToken);
            
            if (latestToken) {
                this.lastRealToken = latestToken;
            }
        }
        
        // We've reached the end of the stream, or a non-indent + non-newline
        // token.
        if (latestToken === undefined) {
            // End of stream.  Let's clean this up.
            
            if (this.lastRealToken === undefined) {
                this.lastRealToken = this.defaultToken;
            }
            
            if (!this.done) {
                // We haven't emitted the end of the final line yet.
                this.done = true;
                this.tokenQueue.push(this.tokenBuilder('eol',
                        this.lastRealToken.value, this.lastRealToken));
            }
            
            // Clean up any indentation levels.
            while (this.indentStack.length > 1) {
                const dedentValue = this.indentStack.pop();
                this.tokenQueue.push(this.tokenBuilder('dedent',
                        peek(this.indentStack), this.lastRealToken));
            }
        }
        else {
            // Some non-indent, non-newline character.  If this.beginningOfLine
            // is true, we're the first token of the line and curIndent is our
            // indent level.  Otherwise, we're some middle-of-line token and
            // curToken is irrelevant.
            
            if (this.beginningOfLine) {
                // We need to do indent bookkeeping.
            
                if (this.indentStack.length === 0) {
                    // We've yet to establish an indent level.  Let's do that.
                    this.indentStack.push(curIndent);
                }
                else {
                    // We have an established indent level.  Let's emit
                    // appropriate indent/dedent/newline events.
                    let establishedIndent = peek(this.indentStack);
                    if (curIndent.length < establishedIndent.length) {
                        while (peek(this.indentStack) !== curIndent) {
                            this.indentStack.pop();
                            
                            if (this.indentStack.length === 0) {
                                throw new Error('Inconsistent indent.');
                            }
                            
                            this.tokenQueue.push(this.tokenBuilder(
                                    'dedent', curIndent, latestToken));
                        }
                    }
                    else if (curIndent.length > establishedIndent.length) {
                        if (!curIndent.startsWith(establishedIndent)) {
                            throw new Error('Inconsistent indent.');
                        }
                        
                        this.indentStack.push(curIndent);
                        
                        this.tokenQueue.push(this.tokenBuilder(
                                'indent', curIndent, latestToken));
                    }
                    else {
                        if (curIndent !== establishedIndent) {
                            throw new Error('Inconsistent indent.');
                        }
                    }
                }
            }
            
            // Having done any necessary indent/dedent bookkeeping, emit the
            // token itself.
            this.tokenQueue.push(latestToken);
            
            // Having found a non-newline token, we're no longer at the
            // beginning of the line.
            this.beginningOfLine = false;
        }
    }
};

function peek(a) {
    return a[a.length - 1];
}

const defaultIndentRegexp = /^[\t ]+$/;
const defaultNewlineRegexp = /^(?:\n|\r\n)+$/;
function defaultControlTokenRecognizer(token) {
    let result;
    
    if (defaultNewlineRegexp.test(token.value)) {
        result = 'newline';
    }
    else if (defaultIndentRegexp.test(token.value)) {
        result = 'indent';
    }
        
    return result;
}

