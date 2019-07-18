// This is not necessarily a complete implementation of a dynamic loader, nor
// is it well tested.

const fs = require('fs');

// Default value wasm-ld uses; equal to WasmPageSize
const STACK_SIZE = 65536;
const utf8decoder = new TextDecoder(); 

function round_up_align(num, align) {
    if (align == 0 || num % align == 0) {
        return num;
    }
    return num + align - num % align;
}

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

    // Load dependency modules, and import their exports
    dylink.needed_dynlibs = [];
    for (var i = 0; i < needed_dynlibs_count; i++) {
        let length;
        [length, idx] = read_varuint32(array, idx);
        let path = utf8decoder.decode(section[0].slice(idx, idx + length));
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

    async load_module(path) {
        if (this.dynamic_libraries[path] !== undefined) {
            return this.dynamic_libaries[path];
        }

        let data = fs.readFileSync(path);
        let module = await WebAssembly.compile(data);
        let dylink = parse_dylink(module);

        let dynlibs = [];
        for (let path of dylink.needed_dynlibs) {
            dynlibs.push(await this.load_module(path));
        }

        let env = this.make_env();
        env.__memory_base = round_up_align(env.__memory_base, dylink.memoryalignment);
        for (let library of dynlibs) {
            Object.assign(env, library.exports);
        }

        let instance = await WebAssembly.instantiate(module, {env: env});
        this.dynamic_libraries[path] = instance;

        // Update values that will be used by next module
        this.__memory_base = env.__memory_base + dylink.memorysize;
        this.__table_base = env.__table_base + dylink.tablesize;

        return instance;
    }
}

let wasm = new DynamicWebAssembly({print_int: console.log});
wasm.load_module("bin.wasm").then(instance => instance.exports.main());
