const { findIndex, isEmpty, compact, isNil, isFunction, isString, cloneDeep, castArray } = require("lodash");
const Tokenizer = require("tokenize-this");
const { operators } = require("../operators");

class TokenListVisitor {
    constructor(tokens) {
        if (isString(tokens)) tokens = this.tokenize(tokens);
        this.tokens = tokens;
    }
    tokenize(rawStr) {
        const tokens = [];
        const tokenizer = new Tokenizer();
        tokenizer.tokenize(rawStr, (token) => {
            if (tokens.length > 0) {
                for (const combined of [
                    tokens[tokens.length - 1] + token,
                    tokens[tokens.length - 1] + ' ' + token
                ]) {
                    if (operators[combined]) {
                        tokens[tokens.length - 1] = combined;
                        return;
                    }
                }
            }
            tokens.push(`${token}`);
        });
        return tokens;
    }
    toString() {
        return compact(this.tokens).join(' ');
    }
    findToken(value, isCaseSensitive = false, startIdx = 0) {
        const lowerValue = value.toLowerCase();
        const idx = findIndex(this.tokens, token => (
            isCaseSensitive
                ? token === value
                : token.toLowerCase() === lowerValue
        ));
        return idx >= 0
            ? new TokenItemVisitor(idx, this)
            : null;
    }
    first() {
        return new TokenItemVisitor(0, this);
    }
    last() {
        return new TokenItemVisitor(this.tokens.length - 1, this);
    }
    _replaceRange(startIdx, endIdx, tokenList) {
        const normalized = this._normalizeTokenList(tokenList);
        this.tokens.splice(startIdx, endIdx - startIdx, ...normalized);
        return new TokenRangeVisitor(startIdx, normalized.length, this);
    }
    _replaceAtIndex(i, tokenList) {
        const normalized = this._normalizeTokenList(tokenList);
        this.tokens.splice(i, 1, ...normalized);
        return new TokenRangeVisitor(i, normalized.length, this);
    }
    _insertAtIndex(i, tokenList) {
        const normalized = this._normalizeTokenList(tokenList);
        if (normalized.length === 0) return null;
        this.tokens.splice(i, 0, ...normalized);
        return new TokenRangeVisitor(i, normalized.length, this);
    }
    _normalizeTokenList(tokenList) {
        return compact(castArray(tokenList));
    }
    _selectRange(start, step, predicate) {
        const range = { start: null, end: null };
        for (let i = start; i < this.tokens.length && i >= 0; i += step) {
            const token = this.tokens[i];
            const shouldSelect = predicate(token, i);
            if (shouldSelect) {
                if (i <= start) {
                    range.start = i;
                }
                if (i >= start) {
                    range.end = i + 1;
                }
            } else break;
        }
        if (isNil(range.start) || isNil(range.end)) {
            return null;
        }
        return new TokenRangeVisitor(range.start, range.end, this);
    }
}

class TokenItemVisitor {
    constructor(index, tokenListVisitor) {
        this.index = index;
        this.tokenListVisitor = tokenListVisitor;
    }
    token() {
        return this.tokenListVisitor.tokens[this.index];
    }
    peek(count = 1) {
        return this.tokenListVisitor.tokens.slice(this.index, this.index + count).join(' ');
    }
    next(token, isCaseSensitive = false) {
        if (!isNil(token)) {
            return this.tokenListVisitor.findToken(token, isCaseSensitive, this.index + 1);
        }
        this.index += 1;
        return this;
    }
    replace(replacement) {
        if (isFunction(replacement)) {
            const token = cloneDeep(this.tokenListVisitor.tokens[this.index])
            replacement = replacement(token)
        }
        if (isString(replacement)) replacement = this.tokenListVisitor.tokenize(replacement);
        return this.tokenListVisitor._replaceAtIndex(this.index, replacement)
    }
    insertBefore(tokens) {
        if (isString(tokens)) tokens = this.tokenListVisitor.tokenize(tokens);
        if (isEmpty(tokens)) throw new Error("Expected to find atleast one token");
        return this.tokenListVisitor._insertAtIndex(this.index, tokens);
    }
    insertAfter(tokens) {
        if (isString(tokens)) tokens = this.tokenListVisitor.tokenize(tokens);
        if (isEmpty(tokens)) throw new Error("Expected to find atleast one token");
        return this.tokenListVisitor._insertAtIndex(this.index + 1, tokens);
    }
    _normalizeSelectionPredicate(predicate, targetIndex) {
        if (isNil(predicate)) return takeOneAt(targetIndex);
        if (isString(predicate)) return (t) => t === predicate;
        if (isFunction(predicate)) return predicate;
        throw new Error(`Invalid predicate supplied: ${predicate}. Expected function or token`);
    }
    select(until) {
        const predicate = this._normalizeSelectionPredicate(until, this.index);
        return this.tokenListVisitor._selectRange(this.index, 1, predicate);
    }
    selectPrev(until) {
        const start = this.index - 1;
        const predicate = this._normalizeSelectionPredicate(until, start)
        return this.tokenListVisitor._selectRange(start, -1, predicate);
    }
    selectNext(until) {
        const start = this.index + 1;
        const predicate = this._normalizeSelectionPredicate(until, start)
        return this.tokenListVisitor._selectRange(start, 1, predicate);
    }
}

class TokenRangeVisitor {
    constructor(startIndex, endIndex, tokenListVisitor) {
        this.startIndex = startIndex;
        this.endIndex = endIndex;
        this.tokenListVisitor = tokenListVisitor;
    }
    first() {
        return new TokenItemVisitor(this.startIndex, this.tokenListVisitor);
    }
    last() {
        return new TokenItemVisitor(this.endIndex, this.tokenListVisitor);
    }
    extendLeft(until) {
        const rangeVisitor = this.tokenListVisitor._selectRange(this.startIndex, -1, until);
        if (!isNil(rangeVisitor)) {
            rangeVisitor.endIndex = this.endIndex;
        }
        return rangeVisitor;
    }
    extendRight(until) {
        const rangeVisitor = this.tokenListVisitor._selectRange(this.endIndex, 1, until);
        if (!isNil(rangeVisitor)) {
            rangeVisitor.startIndex = this.startIndex;
        }
        return rangeVisitor
    }
    replace(replacement) {
        if (isFunction(replacement)) {
            const tokens = cloneDeep(this.tokenListVisitor.tokens.slice(this.startIndex, this.endIndex))
            replacement = replacement(tokens)
        }
        if (isString(replacement)) replacement = this.tokenListVisitor.tokenize(replacement);
        return this.tokenListVisitor._replaceRange(
            this.startIndex,
            this.endIndex,
            replacement
        );
    }
}

const takeOneAt = (index) => (_token, i) => i === index;

module.exports = { TokenListVisitor };