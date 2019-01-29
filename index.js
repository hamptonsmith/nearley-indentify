'use strict';

const clone = require('clone');

module.exports = class {
    constructor(nearleyLexer, options) {
        let {
            controlTokenRecognizer,
            emptyLineStrategy,
            tokenBuilder,
            determineIndentLevel,
            lineListeners
        } = (options || {});
        
        this.tokenBuilder = tokenBuilder || ((type, value, base) => {
            const token = clone(base);
            token.type = type;
            token.value = value;
            return token;
        });
        
        this.lineListeners = lineListeners ||
                [ new module.exports.ConsistentIndentEnforcer() ];
        
        this.determineIndentLevel = determineIndentLevel ||
                ((stack, asString) => asString.length);
        
        this.emptyLineStrategy = emptyLineStrategy || (() => {});
        
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
        this.parseState = 'indent';
        this.indentTokens = [];
        this.curIndent = '';
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
            parseState: this.parseState,
            lastRealToken: this.lastRealToken,
            done: this.done,
            indentTokens: this.indentTokens.slice(),
            curIndent: this.curIndent
        };
    }
    
    reset(chunk, info) {
        info = info || {
            baseState: undefined,
            indentStack: [],
            tokenQueue: [],
            parseState: 'indent',
            lastRealToken: undefined,
            done: false,
            indentTokens: [],
            curIndent: ''
        };
    
        this.baseLexer.reset(chunk, info.baseState);
        
        this.indentStack = info.indentStack.slice();
        this.tokenQueue = info.tokenQueue.slice();
        this.parseState = info.parseState;
        this.lastRealToken = info.lastRealToken;
        this.done = info.done;
        this.indentTokens = info.indentTokens.slice();
        this.curIndent = info.curIndent;
    }
    
    formatError(token, message) {
        return this.baseLexer.formatError(token, message);
    }
    
    has(name) {
        return name === 'eol' || name === 'indent' || name === 'dedent' ||
                this.baseLexer.has(name);
    }
    
    readyMoreTokens() {
        // We're guaranteed not to be in the middle of an indent block.
    
        let latestToken = this.baseLexer.next();
        
        if (latestToken) {
            this.lastRealToken = latestToken;
        }
        
        let controlTokenType = this.controlTokenRecognizer(latestToken);
        
        let lineIndentTokens = [];
        while (latestToken !== undefined && controlTokenType !== undefined) {
            switch (controlTokenType) {
                case 'indent': {
                    if (this.parseState === 'indent') {
                        lineIndentTokens.push(latestToken);
                        this.curIndent += latestToken.value;
                        
                        this.indentTokens.push(latestToken);
                    }
                    else {
                        // Indent token in the middle of a line.  Not
                        // interesting to us--emit it along to the client.
                        this.tokenQueue.push(latestToken);
                    }
                    
                    break;
                }
                case 'newline': {
                    if (this.parseState === 'indent') {
                        // This line is nothing but indentation and a newline.
                        this.emptyLineStrategy(latestToken, token => {
                            this.tokenQueue.push(token);
                        });
                        
                        // We haven't found a non-whitespace token to trigger
                        // this, so let's take care of it now.
                        this.lineListeners.forEach(l => {
                            l.onLine(this.curIndent, this.indentTokens,
                                    latestToken, 'newline');
                        });
                    }
                    else {
                        this.tokenQueue.push(this.tokenBuilder('eol',
                                this.lastRealToken.value, this.lastRealToken));
                    }
                    
                    this.indentTokens = [];
                    
                    lineIndentTokens = [];
                    this.parseState = 'indent';
                    this.curIndent = '';
                    
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
            
            if (this.parseState !== 'done') {
                // We haven't emitted the end of the final line yet.
                
                switch (this.parseState) {
                    case 'content': {
                        this.tokenQueue.push(this.tokenBuilder('eol',
                                this.lastRealToken.value, this.lastRealToken));

                        this.indentTokens = [];
                        
                        break;
                    }
                    case 'indent': {
                        // This line is nothing but indentation and a newline.
                        this.emptyLineStrategy(latestToken, token => {
                            this.tokenQueue.push(token);
                        });
                        
                        // We haven't found a non-whitespace token to trigger
                        // this, so let's take care of it now.
                        this.lineListeners.forEach(l => {
                            l.onLine(this.curIndent, this.indentTokens,
                                    undefined, undefined);
                        });
                        
                        break;
                    }
                    /* istanbul ignore next : this would be a programming
                     * error
                     */
                    default: {
                        throw new Error(this.parseState);
                    }
                }
                
                this.parseState = 'done';
            }
            
            // Clean up any indentation levels.
            while (this.indentStack.length > 1) {
                this.indentStack.pop();
                this.tokenQueue.push(this.tokenBuilder('dedent',
                        peek(this.indentStack).indent, this.lastRealToken));
            }
        }
        else {
            // Some non-indent, non-newline character.  If parse state is
            // 'indent', we're the first token of the line and curIndent is our
            // indent level.  Otherwise, we're some middle-of-line token and
            // curIndent is irrelevant.
            
            const curIndentLevel =
                    this.determineIndentLevel(lineIndentTokens, this.curIndent);
            
            if (this.parseState === 'indent') {
                // We need to do indent bookkeeping.

                this.lineListeners.forEach(l => {
                    l.onLine(this.curIndent, this.indentTokens,
                            latestToken, controlTokenType);
                });
            
                if (this.indentStack.length === 0) {
                    // We've yet to establish an indent level.  Let's do that.
                    this.indentStack.push({
                        level: curIndentLevel,
                        indent: this.curIndent
                    });
                }
                else {
                    // We have an established indent level.  Let's emit
                    // appropriate indent/dedent/newline events.
                    let establishedIndentLevel = peek(this.indentStack).level;
                    
                    if (curIndentLevel < establishedIndentLevel) {
                        while (peek(this.indentStack).level !==
                                curIndentLevel) {
                            this.indentStack.pop();
                            
                            if (this.indentStack.length === 0) {
                                throw new Error('Inconsistent indent.');
                            }
                            
                            this.tokenQueue.push(this.tokenBuilder(
                                    'dedent', this.curIndent, latestToken));
                        }
                    }
                    else if (curIndentLevel > establishedIndentLevel) {
                        this.indentStack.push({
                            level: curIndentLevel,
                            indent: this.curIndent
                        });
                        
                        this.tokenQueue.push(this.tokenBuilder(
                                'indent', this.curIndent, latestToken));
                    }
                }
            }
            
            // Having done any necessary indent/dedent bookkeeping, emit the
            // token itself.
            this.tokenQueue.push(latestToken);
            
            // Having found a non-indent, non-newline token, we're now in the
            // content part of the line.
            this.parseState = 'content';
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

module.exports.ConsistentIndentEnforcer = class {
    constructor() {
        this.lastIndent = '';
    }
    
    onLine(indentString, indentTokens, indentBreakingToken, ibtType) {
        if (indentBreakingToken !== undefined && ibtType !== 'newline') {
            if (indentString.length > this.lastIndent.length) {
                if (!indentString.startsWith(this.lastIndent)) {
                    throw new Error('Inconsistent indent.');
                }
            }
            else {
                if (!this.lastIndent.startsWith(indentString)) {
                    throw new Error('Inconsistent indent.');
                }
            }
            
            this.lastIndent = indentString;
        }
    }
};
