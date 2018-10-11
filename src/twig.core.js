// ## twig.core.js
//
// This file handles template level tokenizing, compiling and parsing.
module.exports = function (Twig) {
    "use strict";

    Twig.trace = false;
    Twig.debug = false;

    // Default caching to true for the improved performance it offers
    Twig.cache = true;

    Twig.noop = function() {};

    Twig.placeholders = {
        parent: "{{|PARENT|}}"
    };

    Twig.hasIndexOf = Array.prototype.hasOwnProperty("indexOf");

    /**
     * Fallback for Array.indexOf for IE8 et al
     */
    Twig.indexOf = function (arr, searchElement /*, fromIndex */ ) {
        if (Twig.hasIndexOf) {
            return arr.indexOf(searchElement);
        }
        if (arr === void 0 || arr === null) {
            throw new TypeError();
        }
        var t = Object(arr);
        var len = t.length >>> 0;
        if (len === 0) {
            return -1;
        }
        var n = 0;
        if (arguments.length > 0) {
            n = Number(arguments[1]);
            if (n !== n) { // shortcut for verifying if it's NaN
                n = 0;
            } else if (n !== 0 && n !== Infinity && n !== -Infinity) {
                n = (n > 0 || -1) * Math.floor(Math.abs(n));
            }
        }
        if (n >= len) {
            // console.log("indexOf not found1 ", JSON.stringify(searchElement), JSON.stringify(arr));
            return -1;
        }
        var k = n >= 0 ? n : Math.max(len - Math.abs(n), 0);
        for (; k < len; k++) {
            if (k in t && t[k] === searchElement) {
                return k;
            }
        }
        if (arr == searchElement) {
            return 0;
        }
        // console.log("indexOf not found2 ", JSON.stringify(searchElement), JSON.stringify(arr));

        return -1;
    }

    Twig.forEach = function (arr, callback, thisArg) {
        if (Array.prototype.forEach ) {
            return arr.forEach(callback, thisArg);
        }

        var T, k;

        if ( arr == null ) {
          throw new TypeError( " this is null or not defined" );
        }

        // 1. Let O be the result of calling ToObject passing the |this| value as the argument.
        var O = Object(arr);

        // 2. Let lenValue be the result of calling the Get internal method of O with the argument "length".
        // 3. Let len be ToUint32(lenValue).
        var len = O.length >>> 0; // Hack to convert O.length to a UInt32

        // 4. If IsCallable(callback) is false, throw a TypeError exception.
        // See: http://es5.github.com/#x9.11
        if ( {}.toString.call(callback) != "[object Function]" ) {
          throw new TypeError( callback + " is not a function" );
        }

        // 5. If thisArg was supplied, let T be thisArg; else let T be undefined.
        if ( thisArg ) {
          T = thisArg;
        }

        // 6. Let k be 0
        k = 0;

        // 7. Repeat, while k < len
        while( k < len ) {

          var kValue;

          // a. Let Pk be ToString(k).
          //   This is implicit for LHS operands of the in operator
          // b. Let kPresent be the result of calling the HasProperty internal method of O with argument Pk.
          //   This step can be combined with c
          // c. If kPresent is true, then
          if ( k in O ) {

            // i. Let kValue be the result of calling the Get internal method of O with argument Pk.
            kValue = O[ k ];

            // ii. Call the Call internal method of callback with T as the this value and
            // argument list containing kValue, k, and O.
            callback.call( T, kValue, k, O );
          }
          // d. Increase k by 1.
          k++;
        }
        // 8. return undefined
    };

    Twig.merge = function(target, source, onlyChanged) {
        Twig.forEach(Object.keys(source), function (key) {
            if (onlyChanged && !(key in target)) {
                return;
            }

            target[key] = source[key]
        });

        return target;
    };

    /**
     * try/catch in a function causes the entire function body to remain unoptimized.
     * Use this instead so only ``Twig.attempt` will be left unoptimized.
     */
    Twig.attempt = function(fn, exceptionHandler) {
        try { return fn(); }
        catch(ex) { return exceptionHandler(ex); }
    }

    /**
     * Exception thrown by twig.js.
     */
    Twig.Error = function(message, file) {
       this.message = message;
       this.name = "TwigException";
       this.type = "TwigException";
       this.file = file;
    };

    /**
     * Get the string representation of a Twig error.
     */
    Twig.Error.prototype.toString = function() {
        var output = this.name + ": " + this.message;

        return output;
    };

    /**
     * Wrapper for logging to the console.
     */
    Twig.log = {
        trace: function() {if (Twig.trace && console) {console.log(Array.prototype.slice.call(arguments));}},
        debug: function() {if (Twig.debug && console) {console.log(Array.prototype.slice.call(arguments));}}
    };


    if (typeof console !== "undefined") {
        if (typeof console.error !== "undefined") {
            Twig.log.error = function() {
                console.error.apply(console, arguments);
            }
        } else if (typeof console.log !== "undefined") {
            Twig.log.error = function() {
                console.log.apply(console, arguments);
            }
        }
    } else {
        Twig.log.error = function(){};
    }

    /**
     * Wrapper for child context objects in Twig.
     *
     * @param {Object} context Values to initialize the context with.
     */
    Twig.ChildContext = function(context) {
        return Twig.lib.copy(context);
    };

    /**
     * Container for methods related to handling high level template tokens
     *      (for example: {{ expression }}, {% logic %}, {# comment #}, raw data)
     */
    Twig.token = {};

    /**
     * Token types.
     */
    Twig.token.type = {
        output:                 'output',
        logic:                  'logic',
        comment:                'comment',
        raw:                    'raw',
        output_whitespace_pre:  'output_whitespace_pre',
        output_whitespace_post: 'output_whitespace_post',
        output_whitespace_both: 'output_whitespace_both',
        logic_whitespace_pre:   'logic_whitespace_pre',
        logic_whitespace_post:  'logic_whitespace_post',
        logic_whitespace_both:  'logic_whitespace_both'
    };

    /**
     * Token syntax definitions.
     */
    Twig.token.definitions = [
        {
            type: Twig.token.type.raw,
            open: '{% raw %}',
            close: '{% endraw %}'
        },
        {
            type: Twig.token.type.raw,
            open: '{% verbatim %}',
            close: '{% endverbatim %}'
        },
        // *Whitespace type tokens*
        //
        // These typically take the form `{{- expression -}}` or `{{- expression }}` or `{{ expression -}}`.
        {
            type: Twig.token.type.output_whitespace_pre,
            open: '{{-',
            close: '}}'
        },
        {
            type: Twig.token.type.output_whitespace_post,
            open: '{{',
            close: '-}}'
        },
        {
            type: Twig.token.type.output_whitespace_both,
            open: '{{-',
            close: '-}}'
        },
        {
            type: Twig.token.type.logic_whitespace_pre,
            open: '{%-',
            close: '%}'
        },
        {
            type: Twig.token.type.logic_whitespace_post,
            open: '{%',
            close: '-%}'
        },
        {
            type: Twig.token.type.logic_whitespace_both,
            open: '{%-',
            close: '-%}'
        },
        // *Output type tokens*
        //
        // These typically take the form `{{ expression }}`.
        {
            type: Twig.token.type.output,
            open: '{{',
            close: '}}'
        },
        // *Logic type tokens*
        //
        // These typically take a form like `{% if expression %}` or `{% endif %}`
        {
            type: Twig.token.type.logic,
            open: '{%',
            close: '%}'
        },
        // *Comment type tokens*
        //
        // These take the form `{# anything #}`
        {
            type: Twig.token.type.comment,
            open: '{#',
            close: '#}'
        }
    ];


    /**
     * What characters start "strings" in token definitions. We need this to ignore token close
     * strings inside an expression.
     */
    Twig.token.strings = ['"', "'"];

    Twig.token.findStart = function (template) {
        var output = {
                position: null,
                def: null
            },
            close_position = null,
            len = Twig.token.definitions.length,
            i,
            token_template,
            first_key_position,
            close_key_position;

        for (i=0;i<len;i++) {
            token_template = Twig.token.definitions[i];
            first_key_position = template.indexOf(token_template.open);
            close_key_position = template.indexOf(token_template.close);

            Twig.log.trace("Twig.token.findStart: ", "Searching for ", token_template.open, " found at ", first_key_position);

            //Special handling for mismatched tokens
            if (first_key_position >= 0) {
                //This token matches the template
                if (token_template.open.length !== token_template.close.length) {
                    //This token has mismatched closing and opening tags
                    if (close_key_position < 0) {
                        //This token's closing tag does not match the template
                        continue;
                    }
                }
            }
            // Does this token occur before any other types?
            if (first_key_position >= 0 && (output.position === null || first_key_position < output.position)) {
                output.position = first_key_position;
                output.def = token_template;
                close_position = close_key_position;
            } else if (first_key_position >= 0 && output.position !== null && first_key_position === output.position) {
                /*This token exactly matches another token,
                greedily match to check if this token has a greater specificity*/
                if (token_template.open.length > output.def.open.length) {
                    //This token's opening tag is more specific than the previous match
                    output.position = first_key_position;
                    output.def = token_template;
                    close_position = close_key_position;
                } else if (token_template.open.length === output.def.open.length) {
                    if (token_template.close.length > output.def.close.length) {
                        //This token's opening tag is as specific as the previous match,
                        //but the closing tag has greater specificity
                        if (close_key_position >= 0 && close_key_position < close_position) {
                            //This token's closing tag exists in the template,
                            //and it occurs sooner than the previous match
                            output.position = first_key_position;
                            output.def = token_template;
                            close_position = close_key_position;
                        }
                    } else if (close_key_position >= 0 && close_key_position < close_position) {
                        //This token's closing tag is not more specific than the previous match,
                        //but it occurs sooner than the previous match
                        output.position = first_key_position;
                        output.def = token_template;
                        close_position = close_key_position;
                    }
                }
            }
        }

        // delete output['close_position'];

        return output;
    };

    Twig.token.findEnd = function (template, token_def, start) {
        var end = null,
            found = false,
            offset = 0,

            // String position variables
            str_pos = null,
            str_found = null,
            pos = null,
            end_offset = null,
            this_str_pos = null,
            end_str_pos = null,

            // For loop variables
            i,
            l;

        while (!found) {
            str_pos = null;
            str_found = null;
            pos = template.indexOf(token_def.close, offset);

            if (pos >= 0) {
                end = pos;
                found = true;
            } else {
                // throw an exception
                throw new Twig.Error("Unable to find closing bracket '" + token_def.close +
                                "'" + " opened near template position " + start);
            }

            // Ignore quotes within comments; just look for the next comment close sequence,
            // regardless of what comes before it. https://github.com/justjohn/twig.js/issues/95
            if (token_def.type === Twig.token.type.comment) {
              break;
            }
            // Ignore quotes within raw tag
            // Fixes #283
            if (token_def.type === Twig.token.type.raw) {
                break;
            }

            l = Twig.token.strings.length;
            for (i = 0; i < l; i += 1) {
                this_str_pos = template.indexOf(Twig.token.strings[i], offset);

                if (this_str_pos > 0 && this_str_pos < pos &&
                        (str_pos === null || this_str_pos < str_pos)) {
                    str_pos = this_str_pos;
                    str_found = Twig.token.strings[i];
                }
            }

            // We found a string before the end of the token, now find the string's end and set the search offset to it
            if (str_pos !== null) {
                end_offset = str_pos + 1;
                end = null;
                found = false;
                while (true) {
                    end_str_pos = template.indexOf(str_found, end_offset);
                    if (end_str_pos < 0) {
                        throw "Unclosed string in template";
                    }
                    // Ignore escaped quotes
                    if (template.substr(end_str_pos - 1, 1) !== "\\") {
                        offset = end_str_pos + 1;
                        break;
                    } else {
                        end_offset = end_str_pos + 1;
                    }
                }
            }
        }
        return end;
    };

    /**
     * Convert a template into high-level tokens.
     */
    Twig.tokenize = function (template) {
        var tokens = [],
            // An offset for reporting errors locations in the template.
            error_offset = 0,

            // The start and type of the first token found in the template.
            found_token = null,
            // The end position of the matched token.
            end = null;

        while (template.length > 0) {
            // Find the first occurance of any token type in the template
            found_token = Twig.token.findStart(template);

            Twig.log.trace("Twig.tokenize: ", "Found token: ", found_token);

            if (found_token.position !== null) {
                // Add a raw type token for anything before the start of the token
                if (found_token.position > 0) {
                    tokens.push({
                        type: Twig.token.type.raw,
                        value: template.substring(0, found_token.position)
                    });
                }
                template = template.substr(found_token.position + found_token.def.open.length);
                error_offset += found_token.position + found_token.def.open.length;

                // Find the end of the token
                end = Twig.token.findEnd(template, found_token.def, error_offset);

                Twig.log.trace("Twig.tokenize: ", "Token ends at ", end);

                tokens.push({
                    type:  found_token.def.type,
                    value: template.substring(0, end).trim()
                });

                if (template.substr( end + found_token.def.close.length, 1 ) === "\n") {
                    switch (found_token.def.type) {
                        case "logic_whitespace_pre":
                        case "logic_whitespace_post":
                        case "logic_whitespace_both":
                        case "logic":
                            // Newlines directly after logic tokens are ignored
                            end += 1;
                            break;
                    }
                }

                template = template.substr(end + found_token.def.close.length);

                // Increment the position in the template
                error_offset += end + found_token.def.close.length;

            } else {
                // No more tokens -> add the rest of the template as a raw-type token
                tokens.push({
                    type: Twig.token.type.raw,
                    value: template
                });
                template = '';
            }
        }

        return tokens;
    };

    Twig.compile = function (tokens) {
        var self = this;
        return Twig.attempt(function() {

            // Output and intermediate stacks
            var output = [],
                stack = [],
                // The tokens between open and close tags
                intermediate_output = [],

                token = null,
                logic_token = null,
                unclosed_token = null,
                // Temporary previous token.
                prev_token = null,
                // Temporary previous output.
                prev_output = null,
                // Temporary previous intermediate output.
                prev_intermediate_output = null,
                // The previous token's template
                prev_template = null,
                // Token lookahead
                next_token = null,
                // The output token
                tok_output = null,

                // Logic Token values
                type = null,
                open = null,
                next = null;

            var compile_output = function(token) {
                Twig.expression.compile.call(self, token);
                if (stack.length > 0) {
                    intermediate_output.push(token);
                } else {
                    output.push(token);
                }
            };

            var compile_logic = function(token) {
                // Compile the logic token
                logic_token = Twig.logic.compile.call(self, token);

                type = logic_token.type;
                open = Twig.logic.handler[type].open;
                next = Twig.logic.handler[type].next;

                Twig.log.trace("Twig.compile: ", "Compiled logic token to ", logic_token,
                                                 " next is: ", next, " open is : ", open);

                // Not a standalone token, check logic stack to see if this is expected
                if (open !== undefined && !open) {
                    prev_token = stack.pop();
                    prev_template = Twig.logic.handler[prev_token.type];

                    if (Twig.indexOf(prev_template.next, type) < 0) {
                        throw new Error(type + " not expected after a " + prev_token.type);
                    }

                    prev_token.output = prev_token.output || [];

                    prev_token.output = prev_token.output.concat(intermediate_output);
                    intermediate_output = [];

                    tok_output = {
                        type: Twig.token.type.logic,
                        token: prev_token
                    };
                    if (stack.length > 0) {
                        intermediate_output.push(tok_output);
                    } else {
                        output.push(tok_output);
                    }
                }

                // This token requires additional tokens to complete the logic structure.
                if (next !== undefined && next.length > 0) {
                    Twig.log.trace("Twig.compile: ", "Pushing ", logic_token, " to logic stack.");

                    if (stack.length > 0) {
                        // Put any currently held output into the output list of the logic operator
                        // currently at the head of the stack before we push a new one on.
                        prev_token = stack.pop();
                        prev_token.output = prev_token.output || [];
                        prev_token.output = prev_token.output.concat(intermediate_output);
                        stack.push(prev_token);
                        intermediate_output = [];
                    }

                    // Push the new logic token onto the logic stack
                    stack.push(logic_token);

                } else if (open !== undefined && open) {
                    tok_output = {
                        type: Twig.token.type.logic,
                        token: logic_token
                    };
                    // Standalone token (like {% set ... %}
                    if (stack.length > 0) {
                        intermediate_output.push(tok_output);
                    } else {
                        output.push(tok_output);
                    }
                }
            };

            while (tokens.length > 0) {
                token = tokens.shift();
                prev_output = output[output.length - 1];
                prev_intermediate_output = intermediate_output[intermediate_output.length - 1];
                next_token = tokens[0];
                Twig.log.trace("Compiling token ", token);
                switch (token.type) {
                    case Twig.token.type.raw:
                        if (stack.length > 0) {
                            intermediate_output.push(token);
                        } else {
                            output.push(token);
                        }
                        break;

                    case Twig.token.type.logic:
                        compile_logic.call(self, token);
                        break;

                    // Do nothing, comments should be ignored
                    case Twig.token.type.comment:
                        break;

                    case Twig.token.type.output:
                        compile_output.call(self, token);
                        break;

                    //Kill whitespace ahead and behind this token
                    case Twig.token.type.logic_whitespace_pre:
                    case Twig.token.type.logic_whitespace_post:
                    case Twig.token.type.logic_whitespace_both:
                    case Twig.token.type.output_whitespace_pre:
                    case Twig.token.type.output_whitespace_post:
                    case Twig.token.type.output_whitespace_both:
                        if (token.type !== Twig.token.type.output_whitespace_post && token.type !== Twig.token.type.logic_whitespace_post) {
                            if (prev_output) {
                                //If the previous output is raw, pop it off
                                if (prev_output.type === Twig.token.type.raw) {
                                    output.pop();

                                    //If the previous output is not just whitespace, trim it
                                    if (prev_output.value.match(/^\s*$/) === null) {
                                        prev_output.value = prev_output.value.trim();
                                        //Repush the previous output
                                        output.push(prev_output);
                                    }
                                }
                            }

                            if (prev_intermediate_output) {
                                //If the previous intermediate output is raw, pop it off
                                if (prev_intermediate_output.type === Twig.token.type.raw) {
                                    intermediate_output.pop();

                                    //If the previous output is not just whitespace, trim it
                                    if (prev_intermediate_output.value.match(/^\s*$/) === null) {
                                        prev_intermediate_output.value = prev_intermediate_output.value.trim();
                                        //Repush the previous intermediate output
                                        intermediate_output.push(prev_intermediate_output);
                                    }
                                }
                            }
                        }

                        //Compile this token
                        switch (token.type) {
                            case Twig.token.type.output_whitespace_pre:
                            case Twig.token.type.output_whitespace_post:
                            case Twig.token.type.output_whitespace_both:
                                compile_output.call(self, token);
                                break;
                            case Twig.token.type.logic_whitespace_pre:
                            case Twig.token.type.logic_whitespace_post:
                            case Twig.token.type.logic_whitespace_both:
                                compile_logic.call(self, token);
                                break;
                        }

                        if (token.type !== Twig.token.type.output_whitespace_pre && token.type !== Twig.token.type.logic_whitespace_pre) {
                            if (next_token) {
                                //If the next token is raw, shift it out
                                if (next_token.type === Twig.token.type.raw) {
                                    tokens.shift();

                                    //If the next token is not just whitespace, trim it
                                    if (next_token.value.match(/^\s*$/) === null) {
                                        next_token.value = next_token.value.trim();
                                        //Unshift the next token
                                        tokens.unshift(next_token);
                                    }
                                }
                            }
                        }

                        break;
                }

                Twig.log.trace("Twig.compile: ", " Output: ", output,
                                                 " Logic Stack: ", stack,
                                                 " Pending Output: ", intermediate_output );
            }

            // Verify that there are no logic tokens left in the stack.
            if (stack.length > 0) {
                unclosed_token = stack.pop();
                throw new Error("Unable to find an end tag for " + unclosed_token.type +
                                ", expecting one of " + unclosed_token.next);
            }
            return output;
        }, function(ex) {
            if (self.options.rethrow) {
                if (ex.type == 'TwigException' && !ex.file) {
                    ex.file = self.id;
                }

                throw ex
            }
            else {
                Twig.log.error("Error compiling twig template " + self.id + ": ");
                if (ex.stack) {
                    Twig.log.error(ex.stack);
                } else {
                    Twig.log.error(ex.toString());
                }
            }
        });
    };

    function handleException(that, ex) {
        if (that.options.rethrow) {
            if (typeof ex === 'string') {
                ex = new Twig.Error(ex)
            }

            if (ex.type == 'TwigException' && !ex.file) {
                ex.file = that.id;
            }

            throw ex;
        }
        else {
            Twig.log.error("Error parsing twig template " + that.id + ": ");
            if (ex.stack) {
                Twig.log.error(ex.stack);
            } else {
                Twig.log.error(ex.toString());
            }

            if (Twig.debug) {
                return ex.toString();
            }
        }
    }

    /**
     * Parse a compiled template.
     *
     * @param {Array} tokens The compiled tokens.
     * @param {Object} context The render context.
     *
     * @return {string} The parsed template.
     */
    Twig.parse = function (tokens, context, allow_async) {
        var that = this,
            output = [],
            tree = context.nodeInContext || {path:'ROOT',nodes:[]},
            // Store any error that might be thrown by the promise chain.
            err = null,

            // This will be set to is_async if template renders synchronously
            is_async = true,
            promise = null,

            // Track logic chains
            chain = true;
            if(!context.nodeInContext && !tree.parent) tree.parent = tree;
            if(!context.nodeInContext && !tree._focusedNode) tree._focusedNode = tree;
        /*
         * Extracted into it's own function such that the function
         * does not get recreated over and over again in the `forEach`
         * loop below. This method can be compiled and optimized
         * a single time instead of being recreated on each iteration.
         */
        function output_push(o) { output.push(o); }

        function parseTokenLogic(logic) {
            if (typeof logic.chain !== 'undefined') {
                chain = logic.chain;
            }
            if (typeof logic.context !== 'undefined') {
                context = logic.context;
            }
            if (typeof logic.output !== 'undefined') {
                output.push(logic.output);
            }
        }
        function tnSantize(t) {
            return t.replace(/^[\r\n]+\s*/,"").replace(/\s*[\r\n]+\s*$/,"").replace(/[\r\n]+/g,"\n")
        }
        let  _prevOpenTags = [], _onAttrWithExp;
        promise = Twig.async.forEach(tokens, function parseToken(token) {
            Twig.log.debug("Twig.parse: ", "Parsing token: ", token);

            switch (token.type) {
                case Twig.token.type.raw:
                    //output.push(Twig.filters.raw(token.value));
                    let nextElObj, props;
                    const nextExprAttr = token.value 
                    // ? - possible
                    // (1,2: any str without > < ) till open < or (3: possible close tag)
                    // (4: \w+) - tag name; (5: all rest string) till next tag /*open or close*/ ) 
                    const regTag = /([^<>]*)>?([^<>]*)<(\/?)(\w+)([^<]*)/g;
                    let result, afterTagName, attrPart, tagCnt, textCnt, propsRes,
                        openTagCnt = 0, wasAttrWithExp = 0,  regTxt, token_value = token.value,
                        wasOnAttr = false, wasMatch = false;

                    /* if(_onAttrWithExp) {
                        wasOnAttr = true;
                        let tknTest;
                        if(tknTest = token_value.match(/^" (\w+)="$/)){ // / id="/
                            token_value = token_value.slice(tknTest[0].length);
                            tree._focusedNode.nextAttr = tknTest[1];
                        } else if(tknTest = token_value.match(/^"\s*>/)) { // /    >/
                            _onAttrWithExp = false;
                            delete tree._focusedNode.nextAttr;
                            regTxt = token_value.match(/>([\s\S]*?)</);

                            if(regTxt && regTxt[1]) { // Partially DUPLICATE 287h23j
                                tree._focusedNode.nodes.push( {type:"text_node",value:tnSantize(regTxt[1])})
                                token_value = token_value.slice(regTxt[0].length);
                            }
                        } else {
                            _onAttrWithExp = false;
                        }

                        //break;
                    } */
                    console.log('<---',token.value,'--->');
                    // responsible for tag (react els) createion, text nodes, and mutliple attributes in inner match
                    while((result = regTag.exec(token_value)) !== null) {
                        wasMatch = true;
                        const res0wsp = result[0], res0 = res0wsp.trim();
                        const res1wsp = result[1], res1 = res1wsp.trim();
                        const res2wsp = result[2], res2 = res2wsp.trim();
                        const res3 = result[3];
                        const res4wsp = result[4], res4 = res4wsp.trim();

                        console.info('res0 ',res0);
                        if(_prevOpenTags.length && "</"==res0.slice(0,2) && _prevOpenTags[_prevOpenTags.length-1] == res4) {  // closing tag
                                _prevOpenTags.pop();
                                openTagCnt--;
                                tree._focusedNode = tree._focusedNode.parent;
                                if(result[5] && result[5].slice(1).trim().length) { // Partially DUPLICATE 287h23j (right after close tag)
                                    tree._focusedNode.nodes.push( {type:"text_node",value:tnSantize(result[5].slice(1))})

                                }
                                console.log('Close tag and continue')
                                continue;
                        }


                        let restText = res1;
                        if(res2wsp || res1wsp) {

                            if(res2wsp) { // than res1 is rest attribute part of opened tag, res2 is rest text
                                // parsePropsAttrs(res1);
                                restText = res2;
                            } /* else { */ // else res1 is rest text
                            
                            if(restText) { // Partially DUPLICATE 287h23j (after exprr in text)
                                tree._focusedNode.nodes.push( {type:"text_node",value:tnSantize(res2)})
                            }
                        }

                        attrPart = "";
                        propsRes = "";
                        textCnt = "";
                        props = "";
                        tagCnt = 0;


                        if(res3=="/") {
                            _prevOpenTags.pop();
                            openTagCnt--;
                            tree._focusedNode = tree._focusedNode.parent;
                            console.log('Close tag and continue')
                                continue;
                        }
                        afterTagName = result[5] ? result[5].trim() : null;

                        let ATTR_W_EXPR = false;
                        let WHOLE = false;
                        let WHOLE_SELF_CLOSE = false;
                        let STRANGE = false;
                        console.log('atg: ',afterTagName);
                        const cltagp = afterTagName.indexOf('>');
                        if(cltagp>=0) { // have full tag, and maybee text after it
                            let WHOLE = true;
                            if(cltagp!=afterTagName.length-1) { // yes, have text
                                textCnt = afterTagName.slice(cltagp+1);
                            }
                            if(afterTagName[cltagp-1]=="/") {
                                WHOLE_SELF_CLOSE = true;
                            }
                            attrPart = afterTagName.slice(0, cltagp - (WHOLE_SELF_CLOSE?1:0));
                        } else {
                            ATTR_W_EXPR = true;
                            attrPart = afterTagName;
                        }
                        if(ATTR_W_EXPR && attrPart.match(/"/g).length>1) {
                            ATTR_W_EXPR = false;
                            STRANGE = true;
                        }
                        console.log('attr: ',attrPart);

                        nextElObj = {parent:tree._focusedNode,path:tree._focusedNode.path+'['+tree._focusedNode.nodes.length+']/',nodes:[]};
                        tree._focusedNode.nodes.push(nextElObj);
                        if(STRANGE) {
                            //alert('Strange!')
                            console.warn('strange markup '+token.value);
                            nextElObj.type = "strange";
                            nextElObj.debug = token.value;
                            continue;
                        } else {
                            nextElObj.tag = res4;
                            nextElObj.path+= res4;
                            nextElObj.type = 'react';
                            nextElObj.attrExpr = {};
                            nextElObj.attrWithExpr = {};
                            nextElObj.attrs = {};
                            if(attrPart) {
                                attrPart= " " + attrPart; // for fist tag match expression
                               const regTag = /( (([\w-]+)=['"])(.+?)['"])/g
                               while((propsRes = regTag.exec(attrPart)) !== null) {
                                    tagCnt++;
                                    const propName = propsRes[3] == "class" ? "className" : propsRes[3];
                                    props += propName + ':"' + propsRes[4] + '",';
                                    nextElObj.attrs[propName] = propsRes[4];
                                   
                               }
                               console.log('props: ', props);
                               if(props.length) props = props.slice(0,-1); // remove (,) at end 
                               if(ATTR_W_EXPR) {
                                  wasAttrWithExp++;
                                  _onAttrWithExp = true;
                                  const t = attrPart.match(/(\w+)="$/);
                                  // const nextAttrName = t[1];
                                  //nextElObj.nextAttr = nextAttrName;
                               }
                            } else {
                            }
                            if(textCnt) { // Partially DUPLICATE 287h23j
                                nextElObj.nodes.push( {type:"text_node",value:tnSantize(textCnt)})
                            }
                            
                            if(!WHOLE_SELF_CLOSE) {
                                tree._focusedNode = nextElObj;
                                _prevOpenTags.push(res4);
                                openTagCnt++;
                            }
                        }
 
 
                    }
                    if(!wasMatch && !wasOnAttr && token.value.trim().length) 
                        tree._focusedNode.nodes.push( {type:"text_node",value:tnSantize(token.value)})

                    if(!wasAttrWithExp && token.value.indexOf("</")>0) {
                       while(openTagCnt-- > 0) {
                           tree._focusedNode = tree._focusedNode.parent;
                       } 
                    }
                    if(wasAttrWithExp>1) {
                        console.warn('Something wrong!')
                    }                    

                    
                    break;

                case Twig.token.type.logic:

                    const logicType = token.token.type.split('.').pop().toUpperCase();
                    var inner_context = Twig.ChildContext(context);
                    const nextObj = {type:'LOGIC',logic: logicType ,parent:tree._focusedNode,path:tree._focusedNode.path+'['+tree._focusedNode.nodes.length+']/'+logicType,nodes:[]};
                    tree._focusedNode.nodes.push(nextObj);
                    tree._focusedNode = nextObj
                    nextObj._focusedNode = nextObj;
                    inner_context.nodeInContext = nextObj;
                    return Twig.logic.parseAsync.call(that, token.token /*logic_token*/, inner_context, chain)
                        .then(parseTokenLogic).then(function() {
                                // Delete loop-related variables from the context
                                delete nextObj['_focusedNode'];
                                delete inner_context['nodeInContext'];
                                tree._focusedNode = nextObj.parent;

                                // Merge in values that exist in context but have changed
                                // in inner_context.
                                Twig.merge(context, inner_context, true);
                        });
                    break;

                case Twig.token.type.comment:
                    // Do nothing, comments should be ignored
                    break;

                //Fall through whitespace to output
                case Twig.token.type.output_whitespace_pre:
                case Twig.token.type.output_whitespace_post:
                case Twig.token.type.output_whitespace_both:
                case Twig.token.type.output:
                    Twig.log.debug("Twig.parse: ", "Output token: ", token.stack);
                    // Parse the given expression in the given context
                    const firstExpr = token.stack[token.stack.length-1];
                    if(_onAttrWithExp && tree._focusedNode.nextAttr) {
                        tree._focusedNode.attrExpr[tree._focusedNode.nextAttr] = token.stack;
                        tree._focusedNode.attrWithExpr[tree._focusedNode.nextAttr] = token.value;
                        delete tree._focusedNode.nextAttr;
                    } else {
                        tree._focusedNode.nodes.push({
                            type:"EXPR",
                            parent:tree._focusedNode,
                            path:tree._focusedNode.path+'[EXPR]',
                            expr_value: token.value,
                            stack: token.stack
                        })
                    }
                    //return Twig.expression.parseAsync.call(that, token.stack, context)
                    //    .then(output_push);
            }
        })
        .then(function() {
            //output = Twig.output.call(that, output);
            is_async = false;
            delete tree._focusedNode;
            return {originalOutput:output,tree};
        })
        .catch(function(e) {
            if (allow_async)
                handleException(that, e);

            err = e;
        });

        // If `allow_async` we will always return a promise since we do not
        // know in advance if we are going to run asynchronously or not.
        if (allow_async)
            return promise;

        // Handle errors here if we fail synchronously.
        if (err !== null)
            return handleException(this, err);

        // If `allow_async` is not true we should not allow the user
        // to use asynchronous functions or filters.
        if (is_async)
            throw new Twig.Error('You are using Twig.js in sync mode in combination with async extensions.');

        return output;
    };

    /**
     * Tokenize and compile a string template.
     *
     * @param {string} data The template.
     *
     * @return {Array} The compiled tokens.
     */
    Twig.prepare = function(data) {
        var tokens, raw_tokens;

        // Tokenize
        Twig.log.debug("Twig.prepare: ", "Tokenizing ", data);
        raw_tokens = Twig.tokenize.call(this, data);

        // Compile
        Twig.log.debug("Twig.prepare: ", "Compiling ", raw_tokens);
        tokens = Twig.compile.call(this, raw_tokens);

        Twig.log.debug("Twig.prepare: ", "Compiled ", tokens);

        return tokens;
    };

    /**
     * Join the output token's stack and escape it if needed
     *
     * @param {Array} Output token's stack
     *
     * @return {string|String} Autoescaped output
     */
    Twig.output = function(output) {
        var autoescape = this.options.autoescape;

        if (!autoescape) {
            return output.join("");
        }

        var strategy = (typeof autoescape == 'string') ? autoescape : 'html';
        var i = 0,
            len = output.length,
            str = '';

        // [].map would be better but it's not supported by IE8-
        var escaped_output = new Array(len);
        for (i = 0; i < len; i++) {
            str = output[i];

            if (str && (str.twig_markup !== true && str.twig_markup !== strategy)
                && !(strategy === 'html' && str.twig_markup === 'html_attr')) {
                str = Twig.filters.escape(str, [ strategy ]);
            }

            escaped_output[i] = str;
        }

        if (escaped_output.length < 1)
            return '';

        return Twig.Markup(escaped_output.join(""), true);
    }

    // Namespace for template storage and retrieval
    Twig.Templates = {
        /**
         * Registered template loaders - use Twig.Templates.registerLoader to add supported loaders
         * @type {Object}
         */
        loaders: {},

        /**
         * Registered template parsers - use Twig.Templates.registerParser to add supported parsers
         * @type {Object}
         */
        parsers: {},

        /**
         * Cached / loaded templates
         * @type {Object}
         */
        registry: {}
    };

    /**
     * Is this id valid for a twig template?
     *
     * @param {string} id The ID to check.
     *
     * @throws {Twig.Error} If the ID is invalid or used.
     * @return {boolean} True if the ID is valid.
     */
    Twig.validateId = function(id) {
        if (id === "prototype") {
            throw new Twig.Error(id + " is not a valid twig identifier");
        } else if (Twig.cache && Twig.Templates.registry.hasOwnProperty(id)) {
            throw new Twig.Error("There is already a template with the ID " + id);
        }
        return true;
    }

    /**
     * Register a template loader
     *
     * @example
     * Twig.extend(function(Twig) {
     *    Twig.Templates.registerLoader('custom_loader', function(location, params, callback, error_callback) {
     *        // ... load the template ...
     *        params.data = loadedTemplateData;
     *        // create and return the template
     *        var template = new Twig.Template(params);
     *        if (typeof callback === 'function') {
     *            callback(template);
     *        }
     *        return template;
     *    });
     * });
     *
     * @param {String} method_name The method this loader is intended for (ajax, fs)
     * @param {Function} func The function to execute when loading the template
     * @param {Object|undefined} scope Optional scope parameter to bind func to
     *
     * @throws Twig.Error
     *
     * @return {void}
     */
    Twig.Templates.registerLoader = function(method_name, func, scope) {
        if (typeof func !== 'function') {
            throw new Twig.Error('Unable to add loader for ' + method_name + ': Invalid function reference given.');
        }
        if (scope) {
            func = func.bind(scope);
        }
        this.loaders[method_name] = func;
    };

    /**
     * Remove a registered loader
     *
     * @param {String} method_name The method name for the loader you wish to remove
     *
     * @return {void}
     */
    Twig.Templates.unRegisterLoader = function(method_name) {
        if (this.isRegisteredLoader(method_name)) {
            delete this.loaders[method_name];
        }
    };

    /**
     * See if a loader is registered by its method name
     *
     * @param {String} method_name The name of the loader you are looking for
     *
     * @return {boolean}
     */
    Twig.Templates.isRegisteredLoader = function(method_name) {
        return this.loaders.hasOwnProperty(method_name);
    };

    /**
     * Register a template parser
     *
     * @example
     * Twig.extend(function(Twig) {
     *    Twig.Templates.registerParser('custom_parser', function(params) {
     *        // this template source can be accessed in params.data
     *        var template = params.data
     *
     *        // ... custom process that modifies the template
     *
     *        // return the parsed template
     *        return template;
     *    });
     * });
     *
     * @param {String} method_name The method this parser is intended for (twig, source)
     * @param {Function} func The function to execute when parsing the template
     * @param {Object|undefined} scope Optional scope parameter to bind func to
     *
     * @throws Twig.Error
     *
     * @return {void}
     */
    Twig.Templates.registerParser = function(method_name, func, scope) {
        if (typeof func !== 'function') {
            throw new Twig.Error('Unable to add parser for ' + method_name + ': Invalid function regerence given.');
        }

        if (scope) {
            func = func.bind(scope);
        }

        this.parsers[method_name] = func;
    };

    /**
     * Remove a registered parser
     *
     * @param {String} method_name The method name for the parser you wish to remove
     *
     * @return {void}
     */
    Twig.Templates.unRegisterParser = function(method_name) {
        if (this.isRegisteredParser(method_name)) {
            delete this.parsers[method_name];
        }
    };

    /**
     * See if a parser is registered by its method name
     *
     * @param {String} method_name The name of the parser you are looking for
     *
     * @return {boolean}
     */
    Twig.Templates.isRegisteredParser = function(method_name) {
        return this.parsers.hasOwnProperty(method_name);
    };

    /**
     * Save a template object to the store.
     *
     * @param {Twig.Template} template   The twig.js template to store.
     */
    Twig.Templates.save = function(template) {
        if (template.id === undefined) {
            throw new Twig.Error("Unable to save template with no id");
        }
        Twig.Templates.registry[template.id] = template;
    };

    /**
     * Load a previously saved template from the store.
     *
     * @param {string} id   The ID of the template to load.
     *
     * @return {Twig.Template} A twig.js template stored with the provided ID.
     */
    Twig.Templates.load = function(id) {
        if (!Twig.Templates.registry.hasOwnProperty(id)) {
            return null;
        }
        return Twig.Templates.registry[id];
    };

    /**
     * Load a template from a remote location using AJAX and saves in with the given ID.
     *
     * Available parameters:
     *
     *      async:       Should the HTTP request be performed asynchronously.
     *                      Defaults to true.
     *      method:      What method should be used to load the template
     *                      (fs or ajax)
     *      parser:      What method should be used to parse the template
     *                      (twig or source)
     *      precompiled: Has the template already been compiled.
     *
     * @param {string} location  The remote URL to load as a template.
     * @param {Object} params The template parameters.
     * @param {function} callback  A callback triggered when the template finishes loading.
     * @param {function} error_callback  A callback triggered if an error occurs loading the template.
     *
     *
     */
    Twig.Templates.loadRemote = function(location, params, callback, error_callback) {
        var loader,
            // Default to the URL so the template is cached.
            id = typeof params.id == 'undefined' ? location : params.id,
            cached = Twig.Templates.registry[id];

        // Check for existing template
        if (Twig.cache && typeof cached != 'undefined') {
            // A template is already saved with the given id.
            if (typeof callback === 'function') {
                callback(cached);
            }
            // TODO: if async, return deferred promise
            return cached;
        }

        //if the parser name hasn't been set, default it to twig
        params.parser = params.parser || 'twig';
        params.id = id;

        // Default to async
        if (typeof params.async === 'undefined') {
            params.async = true;
        }

        // Assume 'fs' if the loader is not defined
        loader = this.loaders[params.method] || this.loaders.fs;
        return loader.call(this, location, params, callback, error_callback);
    };

    // Determine object type
    function is(type, obj) {
        var clas = Object.prototype.toString.call(obj).slice(8, -1);
        return obj !== undefined && obj !== null && clas === type;
    }

    /**
     * Create a new twig.js template.
     *
     * Parameters: {
     *      data:   The template, either pre-compiled tokens or a string template
     *      id:     The name of this template
     *      blocks: Any pre-existing block from a child template
     * }
     *
     * @param {Object} params The template parameters.
     */
    Twig.Template = function ( params ) {
        var data = params.data,
            id = params.id,
            blocks = params.blocks,
            includes = {},
            macros = params.macros || {},
            base = params.base,
            path = params.path,
            url = params.url,
            name = params.name,
            method = params.method,
            // parser options
            options = params.options;

        // # What is stored in a Twig.Template
        //
        // The Twig Template hold several chucks of data.
        //
        //     {
        //          id:     The token ID (if any)
        //          tokens: The list of tokens that makes up this template.
        //          blocks: The list of block this template contains.
        //          base:   The base template (if any)
        //            options:  {
        //                Compiler/parser options
        //
        //                strict_variables: true/false
        //                    Should missing variable/keys emit an error message. If false, they default to null.
        //            }
        //     }
        //

        this.id     = id;
        this.method = method;
        this.base   = base;
        this.path   = path;
        this.url    = url;
        this.name   = name;
        this.macros = macros;
        this.options = options;

        this.reset(blocks);

        if (is('String', data)) {
            this.tokens = Twig.prepare.call(this, data);
        } else {
            this.tokens = data;
        }

        if (id !== undefined) {
            Twig.Templates.save(this);
        }
    };

    Twig.Template.prototype.reset = function(blocks) {
        Twig.log.debug("Twig.Template.reset", "Reseting template " + this.id);
        this.blocks = {};
        this.includes = {};
        this.importedBlocks = [];
        this.originalBlockTokens = {};
        this.child = {
            blocks: blocks || {}
        };
        this.extend = null;
        this.parseStack = [];
    };

    Twig.Template.prototype.render = function (defProps, params, allow_async) {
        var that = this;

        this.defProps = defProps || {};

        // Clear any previous state
        this.reset();
        if (params && params.blocks) {
            this.blocks = params.blocks;
        }
        if (params && params.macros) {
            this.macros = params.macros;
        }

        return Twig.async.potentiallyAsync(this, allow_async, function() {
            return Twig.parseAsync.call(this, this.tokens, this.defProps)
            .then(function(output) {
                var ext_template,
                    url;

                // Does this template extend another
                if (that.extend) {/* 

                    // check if the template is provided inline
                    if ( that.options.allowInlineIncludes ) {
                        ext_template = Twig.Templates.load(that.extend);
                        if ( ext_template ) {
                            ext_template.options = that.options;
                        }
                    }

                    // check for the template file via include
                    if (!ext_template) {
                        url = Twig.path.parsePath(that, that.extend);

                        ext_template = Twig.Templates.loadRemote(url, {
                            method: that.getLoaderMethod(),
                            base: that.base,
                            async:  false,
                            id:     url,
                            options: that.options
                        });
                    }

                    that.parent = ext_template;

                    return that.parent.renderAsync(that.defProps, {
                        blocks: that.blocks
                    });
                 */}
                output.getReactComp = that.getReactComp.bind(that);
                return output;

                if (!params) {
                    return output.valueOf();
                } else if (params.output == 'blocks') {
                    return that.blocks;
                } else if (params.output == 'macros') {
                    return that.macros;
                } else {
                    return output.valueOf();
                }
            });
        });
    };
    function closeIfElse(output,node,onParentEnd) {
        Array.prototype.push.apply(output, node.ifElseStrBuild)
        output.push(',{elem:null,cond: p=>true }].find( c => !!c.cond(p)).elem')
        if(!onParentEnd || node.parent!=node) { // not on ROOT end (reverse of onParentEnd && node.parent==node)
            output.push(',');
        }
        delete node.ifElseStrBuild;
    }
    function afterNode(output,node,res) {
        if(node.parent && node.parent.ifElseStrBuild && node.parent.nodes[node.parent.nodes.length-1]==node) {
            closeIfElse(output,node.parent,true);
        } 
        return res;
    }

    function createChilds(nodes,_props,key,{React,inh,inc,skipSub},output,isReactChild,loopOutput) {
        if(nodes.length > 1) {
            // return `,[${nodes.map(b => afterNode(output,b,nodeToEl(b))).join(', ')}]`
            if(isReactChild) output.push(',')
            const resNodes = nodes.map(b => afterNode(output,b,nodeToEl(b,_props,key,{React,inh,inc,skipSub},output,loopOutput)))
            output.pop();
            return resNodes;
        } else if(nodes.length==1) {
            // return ',' + afterNode(output,nodes[0],nodeToEl(nodes[0]))
            if(isReactChild) output.push(',')
            const resEl = afterNode(output,nodes[0],nodeToEl(nodes[0],_props,key,{React,inh,inc,skipSub},output,loopOutput))
            output.pop();
            return resEl;
        } else {
            // return '';
        }
    }
    function applyExpression(stack,props,attrName='val') {
        let res = {val:''};
        if(stack && stack.length) {
            if(stack[0].type=='Twig.expression.type.variable') {
                try {
                    res[attrName] = props[stack[0].value];
                    for (var i = 1; i < stack.length; i++) {
                        if(stack[i].type == 'Twig.expression.type.key.period'){
                            res[attrName] = res[attrName][stack[i].key]
                        } else {
                            console.warn('Not implemented')
                        }
                    }    
                } catch(e) {
                    console.warn('expression evaluation error ',e)
                }

            } else {
                console.warn('Not implemented')
            }
        } 
        return res[attrName];
    }
    //const RCR = 'React.createElement('
    function stringifyProps(props,output,isStatic) {
        for( let pk in props) {
            output.push(pk + ':');
            output.push(isStatic ? '"' +props[pk] + '"' : ('p.'+props[pk]));
            output.push(',');
        }
    }
    const RCR = 'R.c('
    function nodeToEl(node,_props,key,{React,inh,inc,skipSub},output,loopOutput) {
        const {type,value,logic,parent,stack,expression,forData,tag,attrs,attrExpr,attrWithExpr,nodes} = node;
        if(!output.noOutput && parent && type!='LOGIC' && parent.ifElseStrBuild) {
            closeIfElse(output,parent);
        }
        if(type=='text_node') { // generation + realtime
            output.push('"'+value+'"');
            output.push(',');
            node.output = output.join('');
            return value; //return `"${value}"`;
        } else if(type=='react') { // generation + realtime
            output.push(RCR)
            output.push('"'+tag+'"')
            output.push(',')
            const propsOut = ['{'];
            const staticProps = stringifyProps(attrs,propsOut,true);
            const exprProps = stringifyProps(attrWithExpr,propsOut);
            propsOut.pop();
            const propsStr = propsOut.length > 1 ? propsOut.join('')+'}' : 'null';
            output.push(loopOutput ? `Object.assign({key},${propsStr})` : propsStr)
            const rProps = {...attrs,key};
            Object.keys(attrExpr).forEach( attrName => {
                rProps[attrName] = applyExpression(attrExpr[attrName],_props,attrName);
            })
            const chlds = createChilds(nodes,_props,key,{React,inh,inc,skipSub},output,true);
            output.push(')');
            output.push(',');
            node.output = output.join('');

            return !chlds || chlds.constructor!=Array ? 
                React.createElement(tag,rProps,chlds) :
                React.createElement.apply(React,[tag,rProps,...chlds]);
        } else if(type=='LOGIC') {
            if(output.noOutput) {
                if(logic=="FOR" && expression && expression[0] && _props[expression[0].value] ) { // realtime

                    return _props[expression[0].value].map( (obj,idx) => {
                        const key = key_var?obj[key_var]:idx,
                            rProps = {
                                ..._props,
                                [value_var]:obj
                            };
                        return createChilds(nodes,rProps,key,{React,inh,inc,skipSub},output);
                    })
                }
                if(logic=="IF" || (logic=="ELSEIF" && !parent.skip)) { // realtime
                    delete parent.skip;
                    if(applyExpression(stack,_props)) {
                        parent.skip = true;
                        return createChilds(nodes,_props,key,{React,inh,inc,skipSub},[]);
                    }
                }
                if(logic == "ELSE") { // realtime
                    if(!parent.skip) {
                        const res = createChilds(nodes,_props,key,{React,inh,inc,skipSub},[]);
                        return res;
                    }
                    else delete parent.skip;
                }        
            }

            if(logic == "BLOCK" && !skipSub) { // generation + realtime
                const blockOutput = [];
                if(nodes.length>1) blockOutput.push('R.c(R.F,null,');
                const res = inh && inh.child && inh.child[node.block] ? createChilds(inh.child[node.block].nodes,_props,key,{React,inh,inc,skipSub},blockOutput) 
                    : createChilds(nodes,_props,key,{React,inh,inc,skipSub},blockOutput);
                    if(nodes.length>1) blockOutput.push(')');
                output.push('p && p.twig_blocks && p.twig_blocks["'+node.block+'"] ? (p.twig_blocks["'+node.block+'"])(p,self_blocks) : ('+blockOutput.join('')+')');
                output.push(',');

                return res;
            }
        } else if(type=='EXPR') {
            if(node.expr_value=='parent()') {
                let chBlock = node.parent;
                for ( ; chBlock.logic!='BLOCK' && chBlock.parent ; chBlock = chBlock.parent ) {
                }
                if(chBlock.logic=='BLOCK' ) {
                    output.push('self_blocks["'+chBlock.block+'"]()')
                }

            } else {
                output.push('p.'+node.expr_value);
            }
            output.push(',')
            if(output.noOutput) return applyExpression(stack,_props);
        }
        if(!output.noOutput && type=='LOGIC' && (logic=="IF" || logic=="ELSEIF" || logic == "ELSE") ) { // generation
            if(logic == "IF" ) {
                if(parent.ifElseStrBuild) {
                    closeIfElse(output,parent);
                    }
                parent.ifElseStrBuild = ['[{elem:'];
            }
            if( logic=="ELSEIF") {
                parent.ifElseStrBuild.push(',{elem:');
            }
            if( logic=="IF" || logic=="ELSEIF") {
                if(nodes.length>1) parent.ifElseStrBuild.push('R.c(R.F15,null,');
                createChilds(nodes,_props,key,{React,inh,inc,skipSub},parent.ifElseStrBuild);
                if(nodes.length>1) parent.ifElseStrBuild.push(')');
                parent.ifElseStrBuild.push(`,cond:p => p.${expression}}`)
            }
            if(logic == "ELSE") {

                if(parent.ifElseStrBuild) {
                    parent.ifElseStrBuild.push(',{elem:');
                    createChilds(nodes,_props,key,{React,inh,inc,skipSub},parent.ifElseStrBuild);
                    parent.ifElseStrBuild.push(',cond: p => true}')
                    closeIfElse(output,parent);
                    output.push(',');
                }
                // output.push('[]')
            }
        }
        if(!output.noOutput && logic=="INCLUDE") { // generation
            const tplAlias = node.inclAlias;
            output.push(tplAlias+'(p)');
            output.push(',');
            
        }
        if(!output.noOutput && logic=="FOR") { // generation
            const {key_var,value_var} = forData, iterable = expression[0].value;
            output.push(`!!p.${iterable} && p.${iterable}.map( (${value_var},idx) => {`);
            output.push(` const key = ${value_var}.${key_var} || idx;`);
            output.push('const res = ');
            if(nodes.length>1) output.push('R.c(R.F,null,');
            createChilds(nodes,_props,key,{React,inh,inc,skipSub},output,false,true);
            if(nodes.length>1) output.push(')');
            output.push('; return res;})');
            output.push(',');                   
            
        }

        return null;
    }
    function genBlocksMap(blocks,opt) {
        let res = ['{'];
        Object.keys(blocks).forEach( bn => {
            res.push('"')
            res.push(bn)
            res.push('":')
            res.push('(bp,self_blocks) => ')
            if(blocks[bn].nodes.length>1) res.push('R.c(R.F,null,');
            res.push('' + nodesToSting(blocks[bn].nodes,blocks[bn],Object.assign({skipSub:true},opt)));
            if(blocks[bn].nodes.length>1) res.push(')');
            res.push(',')
        })
        res.pop();
        res.push('}');
        return res.join('');
    }
    function nodesToSting(nodes,tree,opt) {
        const output = [];

        const strGenCmp = nodes.length > 1 ?
             // `React.createElement('heading',null${createChilds(nodes)}` :
             () => { output.push('R.c(R.F,null,'); createChilds(nodes,{},null,opt,output); output.push(')') } :
             () => { 
                nodeToEl(nodes[0],{},null,opt,output);
                if(!tree.ifElseStrBuild) output.pop()
                else {
                    afterNode(output,nodes[0]);
                }
            }
        strGenCmp({}); // to fill output = []
        return output.join('');
    }
    Twig.Template.prototype.nodesToComponent = function(tree,opt,isExtend) {
        const {nodes} = tree;
        if(!nodes||!nodes.length) return _props => null
        const noOutput = [];
        noOutput.noOutput = true;
        const ReactCmp = nodes.length > 1 ?
             // `React.createElement('heading',null${createChilds(nodes)}` :
             _props => opt.React.createElement(opt.React.Fragment,null,createChilds(nodes,_props,null,opt,noOutput)) :
             _props => nodeToEl(nodes[0],_props,null,opt,noOutput);

        const cmpString = /* isExtend ? '' : */ nodesToSting(nodes,tree,opt)
        const blocksStr = this.blocks && this.blocks.length ? genBlocksMap(this.blocks,opt) : null;

        return {ReactCmp,cmpString,blocksStr}
    }

    Twig.Template.prototype.getReactComp = function (contextAndOpt, params, allow_async) {

        const {tree } = this.render(contextAndOpt, params, allow_async);
        const res = this.nodesToComponent(tree, contextAndOpt,this.isExtend);
        res.tree = tree;
        return res;
    };

    Twig.Template.prototype.importFile = function(file) {
        var url, sub_template;
        if (!this.url && this.options.allowInlineIncludes) {
            file = this.path ? Twig.path.parsePath(this, file) : file;
            sub_template = Twig.Templates.load(file);

            if (!sub_template) {
                sub_template = Twig.Templates.loadRemote(url, {
                    id: file,
                    method: this.getLoaderMethod(),
                    async: false,
                    path: file,
                    options: this.options
                });

                if (!sub_template) {
                    throw new Twig.Error("Unable to find the template " + file);
                }
            }

            sub_template.options = this.options;

            return sub_template;
        }

        url = Twig.path.parsePath(this, file);

        // Load blocks from an external file
        sub_template = Twig.Templates.loadRemote(url, {
            method: this.getLoaderMethod(),
            base: this.base,
            async: false,
            options: this.options,
            id: url
        });

        return sub_template;
    };

    Twig.Template.prototype.importBlocks = function(file, override) {
        var sub_template = this.importFile(file),
            context = this.context,
            that = this,
            key;

        override = override || false;

        sub_template.render(context);

        // Mixin blocks
        Twig.forEach(Object.keys(sub_template.blocks), function(key) {
            if (override || that.blocks[key] === undefined) {
                that.blocks[key] = sub_template.blocks[key];
                that.importedBlocks.push(key);
            }
        });
    };

    Twig.Template.prototype.importMacros = function(file) {
        var url = Twig.path.parsePath(this, file);

        // load remote template
        var remoteTemplate = Twig.Templates.loadRemote(url, {
            method: this.getLoaderMethod(),
            async: false,
            id: url
        });

        return remoteTemplate;
    };

    Twig.Template.prototype.getLoaderMethod = function() {
        if (this.path) {
            return 'fs';
        }
        if (this.url) {
            return 'ajax';
        }
        return this.method || 'fs';
    };

    Twig.Template.prototype.compile = function(options) {
        // compile the template into raw JS
        return Twig.compiler.compile(this, options);
    };

    /**
     * Create safe output
     *
     * @param {string} Content safe to output
     *
     * @return {String} Content wrapped into a String
     */

    Twig.Markup = function(content, strategy) {
        if (typeof content !== 'string' || content.length < 1)
            return content;

        var output = new String(content);
        output.twig_markup = (typeof strategy == 'undefined') ? true : strategy;

        return output;
    };

    return Twig;

};
