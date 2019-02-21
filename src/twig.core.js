// ## twig.core.js
//
// This file handles template level tokenizing, compiling and parsing.
module.exports = function (Twig) {
    "use strict";

    Twig.trace = false;
    Twig.debug = false;

    Twig.mytrace = false;
    Twig.mydebug = false;

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

    Twig.mylog = {
        trace: function() {if (Twig.mytrace && console) {console.log.apply(console,arguments);}},
        debug: function() {if (Twig.mydebug && console) {console.log.apply(console,arguments);}}
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
        var that = this;
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
                Twig.expression.compile.call(that, token);
                if (stack.length > 0) {
                    intermediate_output.push(token);
                } else {
                    output.push(token);
                }
            };

            var compile_logic = function(token) {
                // Compile the logic token
                logic_token = Twig.logic.compile.call(that, token);

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
                        compile_logic.call(that, token);
                        break;

                    // Do nothing, comments should be ignored
                    case Twig.token.type.comment:
                        break;

                    case Twig.token.type.output:
                        compile_output.call(that, token);
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
                                compile_output.call(that, token);
                                break;
                            case Twig.token.type.logic_whitespace_pre:
                            case Twig.token.type.logic_whitespace_post:
                            case Twig.token.type.logic_whitespace_both:
                                compile_logic.call(that, token);
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
            if (that.options.rethrow) {
                if (ex.type == 'TwigException' && !ex.file) {
                    ex.file = that.id;
                }

                throw ex
            }
            else {
                Twig.log.error("Error compiling twig template " + that.id + ": ");
                if (ex.stack) {
                    Twig.log.error(ex.stack);
                } else {
                    Twig.log.error(ex.toString());
                }
            }
        });
    };

    const cmntRe = /<!--([\s\S]*?)-->/g,
        dirRe = /[\s-]@([\w_$][\w\d_$]+)\s*\[(.*?)\]/;
    function processCommentsParse(tpl,token_value,directives,context) {
        const cmnts = [], replaces = [];
        let nextCmnt, nextDir;
        while((nextCmnt = cmntRe.exec(token_value)) !== null) {
            if(!nextCmnt[1]) {
                replaces.push('')
                continue;
            }
            nextDir = nextCmnt[1].match(dirRe);
            let dName;
            if(nextDir && (dName = nextDir[1])) {
                let opts, argsStr = nextDir[2];
                try {
                    argsStr = argsStr.replace( /(["'])(?:(?=(\\?))\2[\s\S])*?\1/g, m => m.replace(/(^'|'$)/g,'"') )
                    opts = JSON.parse('{"args":['+argsStr+']}');
                } catch(e) {
                    console.error('Bad directive: ',e);
                    replaces.push('')
                    continue;
                }
                if(dName=='include') {
                    replaces.push(`<js_ReactInclude val="${opts.args[0]}" src="${opts.args[1]}" />`);
                } else if(dName=='require') {
                    const reqStr = opts.args[0];
                    tpl.requires.push(reqStr);
                    try {
                        const imports = reqStr.match(/import(.*)from\s+['"]/)[1].replace(/[,\{\}]/g,' ').replace(/\s+/g,' ').trim().split(' ');
                        context._$local_scope = context._$local_scope.concat(imports);
                    } catch(e) {
                        console.error(e);
                    }
                    replaces.push('');
                } else {
                    if(!directives[dName]) directives[dName] = [];
                    directives[dName].push(opts);
                    replaces.push('');

                }

            } else {
                replaces.push('');
            }

            // cmnts.push(nextCmnt);
        }
        // console.log(cmnts)
        let i = 0;
        // if(replaces.length) console.log(replaces);
        return replaces.length ? token_value.replace(cmntRe, () => replaces[i++]) : token_value;
    }
    
    function clearTextEndings(t) {
      return t.replace(/^[\r\n]+\s*/,"").replace(/\s*[\r\n]+\s*$/,"")
          .replace(/[\r\n]+/g,"\n");
    }
    /**
     * Parse a compiled template.
     *
     * @param {Array} tokens The compiled tokens.
     * @param {Object} context The render context.
     *
     * @return {string} The parsed template.
     */
    function finishCplxAttr(obj) {
        if(!obj.lastCplxAtrr) return;
        if(obj.attrWithExpr[obj.lastCplxAtrr.tag]) {
            console.warn('Attribute will be overriden!',obj.lastCplxAtrr.tag);
        }
        obj.attrWithExpr[obj.lastCplxAtrr.tag] = obj.lastCplxAtrr;
    }

    function parseExpression(str,context) {
      let expr = Twig.expression.compile.call(this, {type:'output',value:str});
      let exprStr = `err_expr(${str})`
      exprStr = Twig.expression.parse.call(this,expr.stack,context);
      if(typeof exprStr == undefined) {
        exprStr = `err_expr(${g1})`;
      } else if('gen' in exprStr) {
        exprStr = exprStr.gen.valueOf();
      } else if(exprStr.constructor==Object) {
        exprStr = JSON.stringify(exprStr);
      }
      return exprStr;
    }

    function tryParseExpressions(str,context) {
      if(!str) return {_val:str};
      let wholeAttrExp;
      if(wholeAttrExp = str.match(/^\s*\{\{([\s\S]*?)\}\}\s*$/)) {
        return {
          expr:true,
          whole: true,
          _val: parseExpression.call(this,wholeAttrExp[1],context)
        }
      } else if(str.match(/\{\{([\s\S]*?)\}\}/)) {
        return {
          expr: true,
          whole: false,
          _val: str.replace(/\{\{([\s\S]*?)\}\}/g,(all,g1,pos,input) => {
            return '${'+parseExpression.call(this,g1,context)+'}';
          })
        }
      } else {
        return {
          _val: str
        }
      }

    }
    function parseAttrs(attribs,context) {
      const attrs = {...attribs};
      for(let attrName in attrs) {
        if(attrs.hasOwnProperty(attrName)) {
          if(!attrs[attrName] || !attrs[attrName].trim()) {
            delete attrs[attrName];
          } else {
            attrs[attrName]
             = tryParseExpressions.call(this,attrs[attrName],context);
            if(attrName=='class') {
              attrs['className'] = attrs['class'];
              delete attrs['class'];
            }
          }
        }
      }
      return attrs;
    }
    function traverseDomNode(context,parent,node,depth) {
      const {type,name,rawAttrs,classNames,directives} = node;
      const nn = {
        parent,
        directives,
        depth: depth + 1,
      };
      context.nodeInContext = nn;
      let isLogic = false;
      if(type=="text") {
        nn.type = "text_node";
        const _expr = tryParseExpressions(clearTextEndings(node.data),context);
        if(_expr.expr) {
          if(_expr.whole) {
            nn.type = 'EXPR';
            nn.exprGen = _expr._val == 'p.parent()' ? 'parentCmp()' : _expr._val; //TODO Do it less tricky way maybe
            return nn;
          } else {
            if(!_expr._val) return {skip:true};
            nn.value = '`' + _expr._val + '`';
          }
        } else {
          if(!_expr._val) return {skip:true};
          nn.value = '"'+_expr._val+'"';
        }
      } else if(type=="tag") {
        if(name=="gwip_wrap" || name=="gwip_inline") {
          isLogic = true;
          nn.type = "LOGIC";
          let type = node.attribs['data-gwipltype'].toUpperCase();
          let logicVal = (name=="gwip_inline" ?node.children[0] : node.children[0].children[0]).data;
          let cLogic = Twig.logic.compile.call(this, {type:'logic',value:logicVal});
          Twig.logic.parse.call(this,cLogic,context)/* .then( v => {
            console.log(v);
          }).catch( e => console.error(e)) */
          nn.logic = type;
        } else if(name=="js_script") {
          this.rawScripts.push(node.children[0].data);
          return {skip:true};
        } else {
          nn.type = "react";
          nn.tag = name;
        }
      } else if(type=="comment"){
        const nextDir = node.data.match(dirRe);
        let dName;
        if(nextDir && (dName = nextDir[1])) {
            let opts, argsStr = nextDir[2];
            try {
                argsStr = argsStr.replace( /(["'])(?:(?=(\\?))\2[\s\S])*?\1/g, m => m.replace(/(^'|'$)/g,'"') )
                opts = JSON.parse('{"args":['+argsStr+']}');
            } catch(e) {
                console.error('Bad directive: ',e);
                return {skip: true}
            }
            if(dName=='include') {
                nn.tag = 'js_ReactInclude'; /* TODO Remain one approach */
                nn.attrs = parseAttrs({
                  val: opts.args[0],
                  src: opts.args[1]
                })
            } else if(dName=='require') {
                const reqStr = opts.args[0];
                this.requires.push(reqStr);
                return {skip: true}
                try {
                    const imports = reqStr.match(/import(.*)from\s+['"]/)[1].replace(/[,\{\}]/g,' ').replace(/\s+/g,' ').trim().split(' ');
                    context._$local_scope = context._$local_scope.concat(imports);
                } catch(e) {
                    console.error(e);
                }
            } else {
                let nextEl = node.next;
                for ( ; nextEl.type!='tag' && nextEl.next ; nextEl = nextEl.next ) {
                }
                if(nextEl.type=='tag' ) {
                    const directives = nextEl.directives || (nextEl.directives = {});
                    if(!directives[dName]) directives[dName] = [];
                    directives[dName].push(opts);
                }
                return {skip:true};

            }

        } else {
          console.warn('Unknown',node.data);
        }
        
      } else if(name=="style") {
        let css = node.children.map( c => c.data).join("\n");
        let nIndent = css.match(/^\s+/);
        if(nIndent) {
          css = css.replace(new RegExp(nIndent,'g'),'\n  ');
        }
        this.styleBlocks.push({
           css,
           name: node.attribs.name,
           extName: node.attribs.extends,
        })
        nn.parent.styleId = this.styleBlocks.length - 1;
        return {skip: true};
      } else {
        console.warn('Not handled '+name);
        return {skip: true};
      }

      if(name!="gwipdir" && type=="tag") {
        const children = node.children.filter( dn => dn.name!='gwip_wrap_logic_val');
        const nodes = traverseChilds.call(this,context,nn,children,depth+(isLogic?2:1))
        nn.nodes = nodes;
        nn.attrs = parseAttrs(node.attribs,context);
      }

      return nn;
    }
    function traverseChilds(context,parent,chilren,depth) {
      return chilren.map( node => traverseDomNode.call(this,context,parent,node,depth))
      .filter( n => !n.skip); // filter out empty strings
    }

    function domToTree(context,params) {
      const {dom} = context;
      const root = {
        path:'ROOT',

      };
      context.nodeInContext = root;
      root.nodes = traverseChilds.call(this,context,root,dom,0)      
      root.parent = root;// important; will check is root by root.parent==root
      return root;
    }
    Twig.parse = function (tokens, context) {
        if(!tokens) return '';
        var that = this,
            output = [],
            tree = context.nodeInContext || {path:'ROOT',nodes:[],depth:0},


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
        function tnSantize(obj,t) {
            if(!t) return;
            t = clearTextEndings(t).replace(/"/g,'\\"');
            if(!t) return;
            obj.nodes.push( {type:"text_node",value:t})
        }
        let  _prevOpenTags = [];
        tokens.forEach(function parseToken(token) {
            Twig.mylog.debug("Twig.parse: ", "Parsing token: ", token);

            switch (token.type) {
                case Twig.token.type.raw:
                    //output.push(Twig.filters.raw(token.value));
                    let nextElObj, props;
                    // ? - possible
                    // (1,2: any str without > < ) till open < or (3: possible close tag)
                    // (4: \w+) - tag name; (5: all rest string) till next tag /*open or close*/ ) 
                    const regTag = /([^<>]*)>?([^<>]*)<(\/?)(\w+)([^<]*)/g;
                    let result, afterTagName, textCnt, propsRes, styleId,
                        openTagCnt = 0, token_value = token.value,
                        wasMatch = false, directives = {};

                    function processDirectives() {
                        if(Object.keys(directives)) {
                            if(nextElObj) nextElObj.directives = directives;
                            directives = {};
                        }
                    }
                    const styleReg = /<(style)(.*)>([\s\S]*)<\/\1>/;
                    const scriptReg = /<(js_script)(.*)>([\s\S]*)<\/\1>/;
                    let scriptMatch;
                    if(scriptMatch = token_value.match(scriptReg)) {
                        token_value = token_value.replace(scriptReg,'');
                        that.rawScripts.push(scriptMatch[3]);
                    }
                    let styleMatch;
                    if(styleMatch = token_value.match(styleReg)) {
                        token_value = token_value.replace(styleReg,'<style_place/>');
                        styleId = that.styleBlocks.length;
                        const styleDet = {css:styleMatch[3]};
                        let styleNameMtch;
                        if( styleMatch[2] && (styleNameMtch = styleMatch[2].match(/name=['"](.*)['"]/)) ) {
                            styleDet.name = styleNameMtch[1];
                        }
                        if( styleMatch[2] && (styleNameMtch = styleMatch[2].match(/extends=['"](.*)['"]/)) ) {
                            styleDet.extName = styleNameMtch[1];
                        }
                        that.styleBlocks.push(styleDet);
                    }
                    try {
                        token_value = processCommentsParse(that,token_value,directives,context);
                    } catch(e){ 
                        console.error(e);
                    }
                    Twig.mylog.trace('<---',token.value,'--->');
                    // responsible for tag (react els) createion, text nodes, and mutliple attributes in inner match

                    function parsePropsAttrs(attrPart, whole, obj) {
                        if(!attrPart) return;
                        attrPart= " " + attrPart; // for fist tag match expression
                        // extractAllPlaint attrs
                        const attrRe = /( (([\w-]+)=['"])(.+?)['"])/g
                        while((propsRes = attrRe.exec(attrPart)) !== null) {
                           const propName = propsRes[3] == "class" ? "className" : propsRes[3];
                           obj.attrs[propName] = {_val:propsRes[4]};
                          
                        }
                        attrPart = attrPart.slice(1); // remove previously added space " "
                        var cplxReStart = /([\w-]+)="([^"]*)$/, cplxReEnd = /^((?!=").)*(?=")/;
                        var cplxStart = attrPart.match(cplxReStart), cplxEnd = attrPart.match(cplxReEnd);
                        if(!whole) {
                            if(cplxEnd) {
                                if(!obj.lastCplxAtrr)
                                    console.warn('Unexpected',cplxEnd,obj.lastCplxAtrr);
                                else {
                                    if(cplxEnd[1]) {
                                        obj.lastCplxAtrr.items.push({type:'text',value:cplxEnd[0]});
                                    }
                                    Twig.mylog.debug('>> Saved cplx attr on end',obj.lastCplxAtrr);
                                    finishCplxAttr(obj);
                                    delete obj.lastCplxAtrr;
                                }
                            } else if(obj.lastCplxAtrr && !cplxEnd) {
                                console.warn('Unexpected lastCplxAtrr w/o end')
                            } 
                            if(cplxStart) {
                                if(obj.lastCplxAtrr) {
                                    Twig.mylog.debug('>> Saved cplx attr before new',obj.lastCplxAtrr);
                                    finishCplxAttr(obj);
                                }
                                obj.lastCplxAtrr = {
                                    tag: cplxStart[1] == 'class' ? 'className' : cplxStart[1],
                                    items: cplxStart[2] ? [ {type:'text',value:cplxStart[2]}] : []
                                };

                            }
                        } else if(cplxStart || cplxEnd) {
                            console.warn('Unecpected Markup',attrPart,cplxStart,cplxEnd);
                        }
                    }

                    while((result = regTag.exec(token_value)) !== null) {
                        wasMatch = true;
                        const res0wsp = result[0], res0 = res0wsp.trim();
                        const res1wsp = result[1], res1 = res1wsp.trim();
                        const res2wsp = result[2], res2 = res2wsp.trim();
                        const res3 = result[3];
                        const res4wsp = result[4], res4 = res4wsp.trim();

                        propsRes = "";
                        textCnt = "";


                        //Twig.mylog.debug('res0 ',res0);

                        if(_prevOpenTags.length && "</"==res0.slice(0,2) && _prevOpenTags[_prevOpenTags.length-1] == res4) {  // closing tag
                                _prevOpenTags.pop();
                                openTagCnt--;
                                finishCplxAttr(tree._focusedNode);
                                delete tree._focusedNode.lastCplxAtrr;

                                tree._focusedNode = tree._focusedNode.parent;
                                let textPart;
                                if(result[5] && (textPart = result[5].slice(1).trim()).length) {
                                    tnSantize(tree._focusedNode,textPart)

                                }
                                Twig.mylog.debug('Close tag and continue')
                                continue;
                        }


                        let restText = res1;
                        if(res2wsp || res1wsp) {

                            if(res2wsp) { // than res1 is rest attribute part of opened tag, res2 is rest text
                                parsePropsAttrs(res1,false,tree._focusedNode);
                                restText = res2;
                            } /* else { */ // else res1 is rest text
                            
                            if(restText)
                                tnSantize(tree._focusedNode,restText);

                        }

                        if(res3=="/"||res1.slice(-1)=="/") {
                            _prevOpenTags.pop();
                            openTagCnt--;
                            finishCplxAttr(tree._focusedNode);
                            delete tree._focusedNode.lastCplxAtrr;
                            tree._focusedNode = tree._focusedNode.parent;

                            Twig.mylog.trace('Close tag and continue')
                            if(res3=="/")   continue;
                        }
                        afterTagName = result[5] /* ? result[5].trim() : null */;

                        let WHOLE = false;
                        let WHOLE_SELF_CLOSE = false;
                        Twig.mylog.trace('atg: ',afterTagName);
                        const cltagp = afterTagName.indexOf('>');
                        let attrPart = "";
                        if(cltagp>=0) { // have full tag, and maybee text after it
                            WHOLE = true;
                            if(cltagp!=afterTagName.length-1) { // yes, have text
                                textCnt = afterTagName.slice(cltagp+1);
                            }
                            if(afterTagName[cltagp-1]=="/") {
                                WHOLE_SELF_CLOSE = true;
                                if(res4 == 'style_place') {
                                    tree._focusedNode.styleId = styleId;
                                    styleId= undefined;
                                    continue;
                                }
                            }
                            attrPart = afterTagName.slice(0, cltagp - (WHOLE_SELF_CLOSE?1:0)).trim();
                        } else {
                            attrPart = afterTagName;
                        }

                        Twig.mylog.trace('attr: ',attrPart);

                        nextElObj = {parent:tree._focusedNode,depth:tree._focusedNode.depth+1, path:tree._focusedNode.path+'['+tree._focusedNode.nodes.length+']/',nodes:[]};
                        processDirectives();
                        tree._focusedNode.nodes.push(nextElObj);
                        nextElObj.tag = res4;
                        nextElObj.path+= res4;
                        nextElObj.type = 'react';
                        nextElObj.attrWithExpr = {};
                        nextElObj.attrs = {};
                        if(attrPart) {
                           parsePropsAttrs(attrPart,WHOLE,nextElObj);
                        } 
                        if(textCnt) {
                            tnSantize(nextElObj,textCnt);
                        }
                        
                        if(!WHOLE_SELF_CLOSE) {
                            tree._focusedNode = nextElObj;
                            _prevOpenTags.push(res4);
                            openTagCnt++;
                        }
 
                    }
                    const token_value_trim = token_value.trim();

                    if(!wasMatch && token_value_trim.length) {
                        if(token_value_trim.slice(-1).match(/[">]/) || token_value_trim[0]=='"') {
                            parsePropsAttrs(token_value_trim,false,tree._focusedNode);
                            if(token_value.trim().slice(-2,-1)=="/" && token_value.indexOf("<")<0 ) { // for that close tag
                                _prevOpenTags.pop();
                                openTagCnt--;
                                finishCplxAttr(tree._focusedNode);
                                delete tree._focusedNode.lastCplxAtrr;
                                tree._focusedNode = tree._focusedNode.parent;
                            }

                        }
                        else
                            tnSantize(tree._focusedNode,token.value)
                    }


                    
                    break;

                case Twig.token.type.logic:

                    const logicType = token.token.type.split('.').pop().toUpperCase();
                    var inner_context = Twig.ChildContext(context);
                    const nextObj = {type:'LOGIC',logic: logicType,depth: tree._focusedNode.depth + 1,parent:tree._focusedNode,path:tree._focusedNode.path+'['+tree._focusedNode.nodes.length+']/'+logicType,nodes:[]};
                    tree._focusedNode.nodes.push(nextObj);
                    tree._focusedNode = nextObj
                    nextObj._focusedNode = nextObj;
                    inner_context.nodeInContext = nextObj;
                    return Twig.logic.parse.call(that, token.token /*logic_token*/, inner_context, chain)
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

                    const o = Twig.expression.parse.call(that, token.stack, context)
                        
                    if(tree._focusedNode.lastCplxAtrr) {
                        tree._focusedNode.lastCplxAtrr.items.push(
                            {type:'expr',value:o.gen,exprRes:o.val});
                    } else {
                        tree._focusedNode.nodes.push({
                            type:"EXPR",
                            depth: tree._focusedNode.depth + 1,
                            parent:tree._focusedNode,
                            path:tree._focusedNode.path+'[EXPR]',
                            exprGen: o.gen,
                            exprRes:o.val
                        })
                    }
                        
            }
        })
            //output = Twig.output.call(that, output);
        delete tree._focusedNode;
        return {originalOutput:output,tree};
        /* TODO .catch(function(e) {
            err = e;
        }); */

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
            dom = params.dom,
            blocks = params.blocks,
            includes = {},
            styleBlocks = [],
            rawScripts = [],
            requires = [],
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
        this.dom     = dom;
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
        this.styleBlocks = [];
        this.rawScripts = [];
        this.requires = [];
        this.importedBlocks = [];
        this.originalBlockTokens = {};
        this.child = {
            blocks: blocks || {}
        };
        this.extend = null;
        this.parseStack = [];
    };

    Twig.Template.prototype.render = function (defProps, params) {
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

        
        var output = Twig.parse.call(this,this.tokens, this.defProps);
        
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
        
    
    };
    const TAB = "  ";
    function closeIfElse(output,node,onParentEnd,isElse) {
        Array.prototype.push.apply(output, node.ifElseStrBuild)
        if(!isElse) output.push(',{elem:()=>null,cond: p=>true }');
        output.push('].find( c => !!c.cond(p)).elem(p)')
        if(!onParentEnd || node.parent!=node) { // not on ROOT end (reverse of onParentEnd && node.parent==node)
            output.push(',');
        }
        delete node.ifElseStrBuild;
    }

    Twig.Template.prototype.afterNode  = function(output,node,res) {
        if(node.parent && node.parent.ifElseStrBuild && node.parent.nodes[node.parent.nodes.length-1]==node) {
            closeIfElse(output,node.parent,true);
        } 
        return res;
    }

    Twig.Template.prototype.createChilds = function(nodes,depth,_props,key,opts,output,isReactChild,loopOutput) {
        const {React,inh} = opts;
        let sft = '\n' + new Array(depth).fill(TAB).join("");
        sft += TAB;
        if(nodes.length > 1) {
            // return `,[${nodes.map(b => this.afterNode(output,b,this.nodeToEl(b))).join(', ')}]`
            if(isReactChild) output.push(',');
            else output.push(sft);
            const resNodes = nodes.map(b => this.afterNode(output,b,this.nodeToEl(b,_props,key,opts,output,loopOutput)))
            output.pop();
            return resNodes;
        } else if(nodes.length==1) {
            // return ',' + this.afterNode(output,nodes[0],this.nodeToEl(nodes[0]))
            if(isReactChild) output.push(',');
            else output.push(sft);
            const resEl = this.afterNode(output,nodes[0],this.nodeToEl(nodes[0],_props,key,opts,output,loopOutput))
            output.pop();
            return resEl;
        } 
    }

    //const RCR = 'React.createElement('
    function stringifyProps(props,output) {
        for( let pk in props) {
            output.push('"' + pk + '": ');
            const {_val,whole,expr} = props[pk];
            if(expr) {
              if(whole)
                output.push(_val);
              else
                output.push('`' +_val + '`')
            } else 
            output.push('"' + _val + '"');
            output.push(',');
        }
    }

    function stringifyExprProps(props,output,opts) {
        for( let pk in props) {
            output.push('"' + pk + '":');
            for (var i = 0; i < props[pk].items.length; i++) {
                let exprOrText = props[pk].items[i], propExpr = exprOrText.value;

                output.push(exprOrText.type == 'text' ? '"' + propExpr + '"' : propExpr);
                output.push(" + ");
            }
            if(props[pk].items.length>0) output.pop();
            output.push(',');
        }
    }
    function htmlTagToPrimitive(tag) {
        let p = 'primi.';
        switch (tag) {
            case 'a': p+='Touchabale'; break;
            default: p+='View'
        }
        return p;
    }
    const RCR = 'R.c('

    Twig.Template.prototype.nodeToEl = function(node,_props,key,opts,output,loopOutput) {
        const {React,inh,skipSub,mapToPrimitives} = opts;
        const {type,value,logic,depth,parent,forLoopCfg,tag,attrs,/* attrExpr, */attrWithExpr,nodes} = node;
        const sft = '\n' + new Array(depth).fill(TAB).join("");
        if(!output.noOutput && parent && type!='LOGIC' && parent.ifElseStrBuild) {
            closeIfElse(output,parent);
        }
        if(type=='text_node') { // generation + realtime
            output.push(sft);
            if(mapToPrimitives) {
                output.push(RCR);
                output.push('primi.Text,null,'+value+')');
            } else {
                output.push(value);
            }
            output.push(',');
            //node.output = output.join('');
            return value; //return `"${value}"`;
        } else if(type=='react') { // generation + realtime
            const getFirstDirective = dir => node.directives && node.directives[dir] && node.directives[dir].length && node.directives[dir][node.directives[dir].length-1],
                hasMutation = type => node.directives && node.directives.mutate && node.directives.mutate.find( m => m.args[0] == type),
                wrapSelf = hasMutation("wrap-that"),
                override = getFirstDirective("override"),
                hocFn = getFirstDirective("hoc"),
                hocProp = hasMutation("hoc");
            const isIncl = tag=="js_ReactInclude"; /* is include by tag */
            let tagOrCmp = !isIncl && mapToPrimitives?htmlTagToPrimitive(tag) : '"'+tag+'"';
            output.push(sft);
            if(hocFn) {
                const fn = hocFn.args[0];
                output.push(` R.c(${fn}( p => `);
            }
            if(isIncl) { /* is include by tag */
                const {src,val} = attrs;
                if(src && src._val == "fromProps") {
                    output.push(`p['${val._val}'] ? p['${val._val}'](p) : `)
                } 
                if(val && val._val) {
                    tagOrCmp = val._val;
                } else {
                  tagOrCmp = "p => 'Error include: ' + p.val"; // TODO warn only on dev mode, else only console warn
                }
            }
            if(wrapSelf) {
                const Cmp = wrapSelf.args[1];
                output.push(` R.c(p['${Cmp}'] || R.F, p['${Cmp}'] ? p : null, `);
            }
            if(hocProp) {
                const hocName = hocProp.args[1];
                output.push(` R.c((p['${hocName}'] || (eh => eh) )( p => `);
            }
            output.push(RCR)
            let mtion;
            let overridenTagOrCmp, preservedCmpProp;
            if(override) {
                overridenTagOrCmp = override.args[0];
                if(override.args[2]) {
                    preservedCmpProp = override.args[2];
                }
            } 
            let replMutation = '';
            if(mtion = hasMutation("replace-tag") ) {
                const Cmp = mtion.args[1];
                replMutation = ` p['${Cmp}'] || `;
            }
            const isStyled = typeof node.styleId != "undefined";
            if(!isStyled) {
                output.push(overridenTagOrCmp || (replMutation + tagOrCmp))
            } else {
                let StlTag = `StyledCmp_${this.styleBlocks[node.styleId].name || node.styleId}`;
                if(Object.keys(this.blocks).length && this.styleBlocks[node.styleId].name && !this.isExtend) {
                    StlTag = 'ovrrdn && ovrrdn.'+StlTag+ ' || '+StlTag;
                }
                if(!override) {
                    output.push(replMutation + StlTag);
                    if(replMutation) {
                        console.warn('!!! Attention. Replaced element/tag (if will be passed through props) will not be styled ');
                        console.warn('cause replace happen at render cycle through props, but style generation at js initilization step !!!');
                    }
                    this.styleBlocks[node.styleId].tag = tagOrCmp;
                } else {
                    if(preservedCmpProp) {
                        output.push(overridenTagOrCmp);
                        this.styleBlocks[node.styleId].tag = tagOrCmp;
                        tagOrCmp = StlTag;
                    } else {
                        output.push(StlTag);
                        this.styleBlocks[node.styleId].tag = overridenTagOrCmp;
                    }
                }
                
            }
            output.push(',')
            const propsOut = [sft + TAB+'{'];
            if(isStyled) propsOut.push("...p,");
            stringifyProps(attrs,propsOut);
            stringifyExprProps(attrWithExpr,propsOut,opts);
            propsOut.pop();
            const propsStr = propsOut.length > 1 ? propsOut.join('')+'}' : (isStyled ? '{...p}' : 'null');
            if(loopOutput || (override && override.args[1])) {
                output.push('Object.assign(');
                if(loopOutput) output.push('{key},');
                if(override && override.args[1]) output.push(override.args[1]+',');
                if(preservedCmpProp) output.push( '{'+preservedCmpProp+': '+tagOrCmp+',...p},')
                output.push(`${propsStr})`);
            } else {
                output.push(propsStr);
            }
            const rProps = {...attrs,key};

            const chlds = this.createChilds(nodes,depth,_props,key,opts,output,true);
            output.push(sft);
            output.push(')');
            if(hocProp) output.push('),p,null)');
            if(wrapSelf) output.push(')');
            if(hocFn) {
                const fn = hocFn.args[1];
                output.push(`),p,null)`);
            }
            output.push(',');
            //node.output = output.join('');

            return !chlds || chlds.constructor!=Array ? 
                React.createElement(tag,rProps,chlds) :
                React.createElement.apply(React,[tag,rProps,...chlds]);
        } else if(tag=="js_ReactInclude") { /* is include imitation generated from comments */
            try {
                const Cmp = attrs.val._val;
                if(attrs.src && attrs.src._val == "fromProps")
                    output.push(`p['${Cmp}'] ? p['${Cmp}'](p) : null `);
                else 
                    output.push(RCR+`${Cmp}, p, null) `);

            } catch(e) {
                console.error(e);
                output.push('null /* error include */')
            }
            output.push(',');
        } else if(type=='LOGIC') {
            if(output.noOutput) {
                if(logic=="FOR" && node.exprRes && _props[node.exprRes] ) { // realtime

                    return _props[node.exprRes].map( (obj,idx) => {
                        const key = key_var?obj[key_var]:idx,
                            rProps = {
                                ..._props,
                                [value_var]:obj
                            };
                        return this.createChilds(nodes,depth,rProps,key,opts,output);
                    })
                }
                if(logic=="IF" || (logic=="ELSEIF" && !parent.skip)) { // realtime
                    delete parent.skip;
                    if(node.exprRes) {
                        parent.skip = true;
                        return this.createChilds(nodes,depth,_props,key,opts,[]);
                    }
                }
                if(logic == "ELSE") { // realtime
                    if(!parent.skip) {
                        const res = this.createChilds(nodes,depth,_props,key,opts,[]);
                        return res;
                    }
                    else delete parent.skip;
                }        
            }

            if(logic == "BLOCK" && !skipSub) { // generation + realtime
                const blockOutput = [];
                if(nodes.length>1) blockOutput.push('R.c(R.F,null,');
                const res = inh && inh.child && inh.child[node.block] ? this.createChilds(inh.child[node.block].nodes,depth,_props,key,opts,blockOutput) 
                    : this.createChilds(nodes,depth,_props,key,opts,blockOutput);
                    if(nodes.length==0) blockOutput.push('null');
                    if(nodes.length>1) blockOutput.push(')');
                output.push('rdrBlockOrSelf(p, blocks["'+node.block+'"], () => ('+blockOutput.join('')+'), ovrrdn)');
                output.push(',');

                return res;
            }
        } else if(type=='EXPR') {
            if(node.exprGen=='p.parent()') {
                let chBlock = node.parent;
                for ( ; chBlock.logic!='BLOCK' && chBlock.parent ; chBlock = chBlock.parent ) {
                }
                if(chBlock.logic=='BLOCK' ) {
                    output.push('parentCmp()')
                }

            } else {
                output.push( node.exprGen);
            }
            output.push(',')
            if(output.noOutput) return node.exprRes;
        }
        /* if(!output.noOutput && type=='LOGIC') {
          output.push(sft);
        } */
        if(!output.noOutput && type=='LOGIC' && (logic=="IF" || logic=="ELSEIF" || logic == "ELSE") ) { // generation
            
            if(logic == "IF" ) {
                if(parent.ifElseStrBuild) {
                    closeIfElse(output,parent);
                    }
                parent.ifElseStrBuild = [`[${sft+TAB}{elem: p=> `];
            }
            if( logic=="ELSEIF") {
                parent.ifElseStrBuild.push(`,${sft+TAB}{elem: p=> `);
            }
            if( logic=="IF" || logic=="ELSEIF") {
                if(nodes.length>1) parent.ifElseStrBuild.push('R.c(R.F,null,');
                this.createChilds(nodes,depth,_props,key,opts,parent.ifElseStrBuild);
                if(nodes.length>1) parent.ifElseStrBuild.push(')');
                parent.ifElseStrBuild.push(`,${sft+TAB}cond:p => ${node.exprGen}}`)
            }
            if(logic == "ELSE") {

                if(parent.ifElseStrBuild) {
                    parent.ifElseStrBuild.push(',{elem: p=> ');
                    if(nodes.length>1) parent.ifElseStrBuild.push('R.c(R.F,null,');
                    this.createChilds(nodes,depth,_props,key,opts,parent.ifElseStrBuild);
                    if(nodes.length>1) parent.ifElseStrBuild.push(')');
                    parent.ifElseStrBuild.push(',cond: p => true}')
                    closeIfElse(output,parent,false,true);
                    //output.push(',');
                }
                // output.push('[]')
            }
        }
        if(!output.noOutput && logic=="INCLUDE") { // generation
            const tplAlias = node.inclAlias;
            output.push('R.c('+tplAlias+',');
            if(node.withContext) {
                output.push('Object.assign(');
                output.push(node.withContext);
                output.push(',p)');
            } else {
                output.push('p');
            }
            output.push(')');
            output.push(',');
            
        }
        if(!output.noOutput && logic=="FOR") { // generation
            const {key_var,value_var} = forLoopCfg, iterable = node.exprGen;
            output.push(`!!${iterable} && ${iterable}`)

            if(node.conditional)
                output.push( `.filter( ${value_var} => ${ node.conditional.gen } )`)
            output.push(`.map( (${value_var},idx) => {`);
            if(key_var) output.push(` const key = ${value_var}.${key_var} || idx;`);
            else output.push(` const key = idx;`);
            output.push(sft+TAB+'const res = ');
            if(nodes.length>1) output.push('R.c(R.F,{key},');
            this.createChilds(nodes,depth,_props,key,opts,output,false,true);
            if(nodes.length>1) output.push(')');
            output.push('; '+sft+TAB+'return res;})');
            output.push(',');                   
            
        }

        return null;
    }
    Twig.Template.prototype.genBlocksMap = function(blocks,opt) {
        let res = ['{'];
        Object.keys(blocks).forEach( bn => {
            res.push('"')
            res.push(bn)
            res.push('":')
            res.push('(p,__arg_place__) => ')
            if(blocks[bn].nodes.length>0) {
                if(blocks[bn].nodes.length>1) res.push('R.c(R.F,null,');
                res.push('' + this.nodesToSting(blocks[bn].nodes,blocks[bn],Object.assign({skipSub:true},opt)));
                if(blocks[bn].nodes.length>1) res.push(')');
            } else 
                res.push('null');
            res.push(',')
        })
        res.pop();
        res.push('}');
        return res.join('');
    }
    Twig.Template.prototype.nodesToSting = function(nodes,tree,opt) {
        const output = [];

        const strGenCmp = nodes.length > 1 ?
             () => { output.push('R.c(R.F,null,'); this.createChilds(nodes,0,{},null,opt,output); output.push('\n)') } :
             () => { 
                this.nodeToEl(nodes[0],{},null,opt,output);
                if(!tree.ifElseStrBuild) output.pop()
                else {
                    this.afterNode(output,nodes[0]);
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
             _props => opt.React.createElement(opt.React.Fragment,null,this.createChilds(nodes,0,_props,null,opt,noOutput)) :
             _props => this.nodeToEl(nodes[0],_props,null,opt,noOutput);

        const cmpString = /* isExtend ? '' : */ this.nodesToSting(nodes,tree,opt)
        const blocksStr = this.blocks && Object.keys(this.blocks).length ? this.genBlocksMap(this.blocks,opt) : null;

        return {ReactCmp,cmpString,blocksStr}
    }

    Twig.Template.prototype.getReactComp = function (contextAndOpt, params) {
        contextAndOpt._$local_scope = contextAndOpt._$local_scope = [];
        const {tree } = this.render(contextAndOpt, params);
        const res = this.nodesToComponent(tree, Object.assign({},params,contextAndOpt),this.isExtend);
        res.tree = tree;
        return res;
    };

    Twig.Template.prototype.parseToReact = function (context, params) {
      this.reset(); // !important
      context._$local_scope = context._$local_scope = [];

      const tree = domToTree.call(this,Object.assign({dom:this.dom},context),params);
      const res = this.nodesToComponent(tree, Object.assign({},params,context),this.isExtend);
      res.tree = tree;
      return res;
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
