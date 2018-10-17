// ## twig.expression.operator.js
//
// This file handles operator lookups and parsing.
module.exports = function (Twig) {
    "use strict";

    /**
     * Operator associativity constants.
     */
    Twig.expression.operator = {
        leftToRight: 'leftToRight',
        rightToLeft: 'rightToLeft'
    };

    var containment = function (a, b) {
        if (b === undefined || b === null) {
            return null;
        } else if (b.indexOf !== undefined) {
            // String
            return a === b || a !== '' && b.indexOf(a) > -1;
        } else {
            var el;
            for (el in b) {
                if (b.hasOwnProperty(el) && b[el] === a) {
                    return true;
                }
            }
            return false;
        }
    };

    /**
     * Get the precidence and associativity of an operator. These follow the order that C/C++ use.
     * See http://en.wikipedia.org/wiki/Operators_in_C_and_C++ for the table of values.
     */
    Twig.expression.operator.lookup = function (operator, token) {
        switch (operator) {
            case "..":
                token.precidence = 20;
                token.associativity = Twig.expression.operator.leftToRight;
                break;

            case ',':
                token.precidence = 18;
                token.associativity = Twig.expression.operator.leftToRight;
                break;

            // Ternary
            case '?:':
            case '?':
            case ':':
                token.precidence = 16;
                token.associativity = Twig.expression.operator.rightToLeft;
                break;

            // Null-coalescing operator
            case '??':
                token.precidence = 15;
                token.associativity = Twig.expression.operator.rightToLeft;
                break;

            case 'or':
                token.precidence = 14;
                token.associativity = Twig.expression.operator.leftToRight;
                break;

            case 'and':
                token.precidence = 13;
                token.associativity = Twig.expression.operator.leftToRight;
                break;

            case 'b-or':
                token.precidence = 12;
                token.associativity = Twig.expression.operator.leftToRight;
                break;

            case 'b-xor':
                token.precidence = 11;
                token.associativity = Twig.expression.operator.leftToRight;
                break;

            case 'b-and':
                token.precidence = 10;
                token.associativity = Twig.expression.operator.leftToRight;
                break;

            case '==':
            case '!=':
                token.precidence = 9;
                token.associativity = Twig.expression.operator.leftToRight;
                break;

            case '<':
            case '<=':
            case '>':
            case '>=':
            case 'not in':
            case 'in':
                token.precidence = 8;
                token.associativity = Twig.expression.operator.leftToRight;
                break;

            case '~': // String concatination
            case '+':
            case '-':
                token.precidence = 6;
                token.associativity = Twig.expression.operator.leftToRight;
                break;

            case '//':
            case '**':
            case '*':
            case '/':
            case '%':
                token.precidence = 5;
                token.associativity = Twig.expression.operator.leftToRight;
                break;

            case 'not':
                token.precidence = 3;
                token.associativity = Twig.expression.operator.rightToLeft;
                break;

            case 'matches':
                token.precidence = 8;
                token.associativity = Twig.expression.operator.leftToRight;
                break;

            case 'starts with':
                token.precidence = 8;
                token.associativity = Twig.expression.operator.leftToRight;
                break;

            case 'ends with':
                token.precidence = 8;
                token.associativity = Twig.expression.operator.leftToRight;
                break;

            default:
                throw new Twig.Error("Failed to lookup operator: " + operator + " is an unknown operator.");
        }
        token.operator = operator;
        return token;
    };

    /**
     * Handle operations on the RPN stack.
     *
     * Returns the updated stack.
     */
    Twig.expression.operator.parse = function (operator, stack) {
        var _fstack = stack;
        stack = stack.map( obj => obj.val)

        Twig.log.trace("Twig.expression.operator.parse: ", "Handling ", operator);
        var a, b, c;
        var _a, _b, _c;
        var genStr;
        if (operator === '?') {
            c = stack.pop();
            _c = _fstack.pop();
        }

        b = stack.pop();
        _b = _fstack.pop();
        if (operator !== 'not') {
            a = stack.pop();
            _a = _fstack.pop();
        }

        if (operator !== 'in' && operator !== 'not in') {
            if (a && Array.isArray(a)) {
                a = a.length;
            }

            if (b && Array.isArray(b)) {
                b = b.length;
            }
        }

        if (operator === 'matches') {
            if (b && typeof b === 'string') {
                var reParts = b.match(/^\/(.*)\/([gims]?)$/);
                var reBody = reParts[1];
                var reFlags = reParts[2];
                b = new RegExp(reBody, reFlags);
            }
        }
        function genOrVal(obj) {
            return obj.gen || obj.val;
        }
        function genBin(_op) {
            return genStr = '(' + genOrVal(_a) + (_op || operator) + genOrVal(_b) + ')';
        }
        switch (operator) {
            case ':':
                // Ignore
                break;

            case '??':
                if (a === undefined) {
                    a = b;
                    b = c;
                    c = undefined;
                }

                if (a !== undefined && a !== null) {
                    _fstack.push({gen:genStr,val:a});
                } else {
                    _fstack.push({gen:genStr,val:b});
                }
                break;
            case '?:':
                if (Twig.lib.boolval(a)) {
                    _fstack.push({gen:genStr,val:a});
                } else {
                    _fstack.push({gen:genStr,val:b});
                }
                break;
            case '?':
                if (a === undefined) {
                    //An extended ternary.
                    a = b;
                    b = c;
                    c = undefined;
                }

                if (Twig.lib.boolval(a)) {
                    _fstack.push({gen:genStr,val:b});
                } else {
                    _fstack.push({gen:genStr,val:c});
                }
                break;

            case '+':
                b = parseFloat(b);
                a = parseFloat(a);
                
                _fstack.push({gen:genBin(),val:a + b});
                break;

            case '-':
                b = parseFloat(b);
                a = parseFloat(a);
                _fstack.push({gen:genBin(),val:a - b});
                break;

            case '*':
                b = parseFloat(b);
                a = parseFloat(a);
                _fstack.push({gen:genBin(),val:a * b});
                break;

            case '/':
                b = parseFloat(b);
                a = parseFloat(a);
                _fstack.push({gen:genBin(),val:a / b});
                break;

            case '//': // TODO 
                b = parseFloat(b);
                a = parseFloat(a);
                _fstack.push({gen:genStr,val:Math.floor(a / b)});
                break;

            case '%':
                b = parseFloat(b);
                a = parseFloat(a);
                _fstack.push({gen:genStr,val:a % b});
                break;

            case '~':
                genStr = ` [ ${genOrVal(_a)}||"",${genOrVal(_b)}||""].join('') `
                _fstack.push({gen:genStr,val: (a != null ? a.toString() : "")
                          + (b != null ? b.toString() : "") });
                break;

            case 'not':
            case '!':
                genStr = '!'+genOrVal(b);
                _fstack.push({gen:genStr,val:!Twig.lib.boolval(b)});
                break;

            case '<':
                _fstack.push({gen:genBin(),val:a < b});
                break;

            case '<=':
                _fstack.push({gen:genBin(),val:a <= b});
                break;

            case '>':
                _fstack.push({gen:genBin(),val:a > b});
                break;

            case '>=':
                _fstack.push({gen:genBin(),val:a >= b});
                break;

            case '===':
                _fstack.push({gen:genBin(),val:a === b});
                break;

            case '==':
                _fstack.push({gen:genBin(),val:a == b});
                break;

            case '!==':
                _fstack.push({gen:genBin(),val:a !== b});
                break;

            case '!=':
                _fstack.push({gen:genBin(),val:a != b});
                break;

            case 'or':
                _fstack.push({gen:genBin('||'),val:Twig.lib.boolval(a) || Twig.lib.boolval(b)});
                break;

            case 'b-or':
                _fstack.push({gen:genBin('|'),val:a | b});
                break;

            case 'b-xor':
                _fstack.push({gen:genBin('^'),val:a ^ b});
                break;

            case 'and':
                _fstack.push({gen:genBin('&&'),val:Twig.lib.boolval(a) && Twig.lib.boolval(b)});
                break;

            case 'b-and':
                _fstack.push({gen:genBin('&'),val:a & b});
                break;

            case '**':
                genStr = `Math.pow(${genOrVal(_a)}, ${genOrVal(_b)})`
                _fstack.push({gen:genStr,val:Math.pow(a, b)});
                break;

            case 'not in':
                genStr = `(false == ${genOrVal(_a)} in ${genOrVal(_b)})`
                _fstack.push({gen:genStr,val: !containment(a, b) });
                break;

            case 'in':
                genStr = ` ${genOrVal(_a)} in ${genOrVal(_b)}`
                _fstack.push({gen:genStr,val: containment(a, b) });
                break;

            case 'matches':
                _fstack.push({gen:genStr,val: b.test(a) });
                break;

            case 'starts with':
                genStr = `(${genOrVal(_a)} && ${genOrVal(_a)}.indexOf(${genOrVal(_b)}) === 0 )`
                _fstack.push({gen:genStr,val: a && a.indexOf(b) === 0 });
                break;

            case 'ends with':
                genStr = `(${genOrVal(_a)} && ${genOrVal(_a)}.lastIndexOf(${genOrVal(_b)}) + ${genOrVal(_b)}.length == ${genOrVal(_a)}.length )`
                _fstack.push({gen:genStr,val: a.indexOf(b, a.length - b.length) !== -1 });
                break;

            case '..':
                const f = genOrVal(_a), s = genOrVal(_b);
                genStr = ` [...Array(Math.abs(${s} - ${f} +1)).keys()].map( n => ${f} + (${s}- ${f}>0 ? n: -n)) `
                _fstack.push({gen:genStr,val: Twig.functions.range(a, b) });
                break;

            default:
                debugger;
                throw new Twig.Error("Failed to parse operator: " + operator + " is an unknown operator.");
        }
    };

    return Twig;

};
