#!/usr/bin/env node

// https://github.com/WebAssembly/tool-conventions/blob/master/DynamicLinking.md

// This is not necessarily a complete implementation of a dynamic loader, nor
// is it well tested.

'use strict';

const fs = require('fs');

// Default value wasm-ld uses; equal to WasmPageSize
const STACK_SIZE = 64 * 1024;
const utf8decoder = new TextDecoder();

// Round 'num' up so it is aligned to a multiple of 'align'
function round_up_align(num, align) {
    if (align == 0 || num % align == 0) {
        return num;
    }
    return num + align - num % align;
}

// Reads a 'varint32' integer, which is based on the variable-length encoding
// LEB128
function read_varuint32(array, idx) {
    let value = 0;
    let count = 0;
    while (count < 5) {
        let b = array[idx + count];
        value |= (b & 0x7f) << (7 * count);
        count++;
        if ((b & 0x80) == 0) {
            break;
        }
    }
    return [value, idx + count];
}

// Extracts the "dylib" Custom section from WebAssembly module, and parses it
// into an object.
function parse_dylink(module) {
    let section = WebAssembly.Module.customSections(module, "dylink");
    let array = new Uint8Array(section[0]);

    let dylink = {};

    let idx = 0;
    let needed_dynlibs_count;
    [dylink.memorysize, idx] = read_varuint32(array, idx);
    [dylink.memoryalignment, idx] = read_varuint32(array, idx);
    [dylink.tablesize, idx] = read_varuint32(array, idx);
    [dylink.tablealignment, idx] = read_varuint32(array, idx);
    [needed_dynlibs_count, idx] = read_varuint32(array, idx);

    dylink.needed_dynlibs = [];
    for (var i = 0; i < needed_dynlibs_count; i++) {
        let length;
        [length, idx] = read_varuint32(array, idx);
        let path = utf8decoder.decode(array.slice(idx, idx + length));
        dylink.needed_dynlibs.push(path);
        idx += length;
    }

    return dylink;
}

class DynamicWebAssembly {
    constructor(imports) {
        this.dynamic_libraries = {};
        this.memory = new WebAssembly.Memory({initial: 1024});
        this.__indirect_function_table = new WebAssembly.Table({element: "anyfunc", initial: 0});
        this.__stack_pointer = new WebAssembly.Global({value: "i32", mutable: true}, STACK_SIZE);
        this.__memory_base = STACK_SIZE;
        this.__table_base = 0;
        this.imports = imports;
    }

    make_env() {
        let env = {
            memory: this.memory,
            __indirect_function_table: this.__indirect_function_table,
            __stack_pointer: this.__stack_pointer,
            __memory_base: this.__memory_base,
            __table_base: this.__table_base
        };
        Object.assign(env, this.imports);
        return env;
    }

    async _read_module(path) {
        let file = await fs.promises.open(path);
        let data = await fs.promises.readFile(file);
        return await WebAssembly.compile(data);
    }

    async load_module(path) {
        if (this.dynamic_libraries[path] !== undefined) {
            return this.dynamic_libaries[path];
        }

        let module = await this._read_module(path);
        let dylink = parse_dylink(module);

        let dynlibs = [];
        for (let path of dylink.needed_dynlibs) {
            dynlibs.push(await this.load_module(path));
        }

        let env = this.make_env();
        env.__memory_base = round_up_align(env.__memory_base, dylink.memoryalignment);
        env.__table_base = round_up_align(env.__table_base, dylink.tablealignment);
        for (let library of dynlibs) {
            Object.assign(env, library.exports);
        }

        // Update values that will be used by next module
        this.__memory_base = env.__memory_base + dylink.memorysize;
        this.__table_base = env.__table_base + dylink.tablesize;

        this.__indirect_function_table.grow(this.__table_base - this.__indirect_function_table.length);

        let instance = await WebAssembly.instantiate(module, {env: env});
        instance.exports.__wasm_call_ctors();
        this.dynamic_libraries[path] = instance;
        return instance;
    }
}

process.on('unhandledRejection', e => { throw e; });

function print_int(num) {
    process.stdout.write(num.toString());
}

function print_str(addr) {
    let u8 = new Uint8Array(wasm.memory.buffer);
    let end = addr;
    while (u8[end] != 0)
        end++;
    let str = utf8decoder.decode(wasm.memory.buffer.slice(addr, end));
    process.stdout.write(str);
}

let wasm = new DynamicWebAssembly({print_int: print_int, print_str: print_str});
wasm.load_module("bin.wasm").then(instance => instance.exports.main());
