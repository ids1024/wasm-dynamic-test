// This is not necessarily a complete implementation of a dynamic loader, nor
// is it well tested.

const fs = require('fs');

// Default value wasm-ld uses; equal to WasmPageSize
const STACK_SIZE = 65536;

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

dynamic_libraries = {};

async function load_wasm_module(path, env) {
    if (dynamic_libraries[path] !== undefined) {
        return dynamic_libaries[path];
    }

    let data = fs.readFileSync(path);
    let module = await WebAssembly.compile(data);

    let dylink = WebAssembly.Module.customSections(module, "dylink");
    let dylink_array = new Uint8Array(dylink[0]);

    let idx = 0;
    let memorysize, memoryalignment, tablesize, tablealignment,
        needed_dynlibs_count;
    [memorysize, idx] = read_varuint32(dylink_array, idx);
    [memoryalignment, idx] = read_varuint32(dylink_array, idx);
    [tablesize, idx] = read_varuint32(dylink_array, idx);
    [tablealignment, idx] = read_varuint32(dylink_array, idx);
    [needed_dynlibs_count, idx] = read_varuint32(dylink_array, idx);

    importObject = {"env": {}};

    // Load dependency modules, and import their exports
    let utf8decoder = new TextDecoder(); 
    for (var i = 0; i < needed_dynlibs_count; i++) {
        let length;
        [length, idx] = read_varuint32(dylink_array, idx);
        let path = utf8decoder.decode(dylink[0].slice(idx, idx + length));
        let library = await load_wasm_module(path, env);
        Object.assign(importObject.env, library.exports);
        idx += length;
    }

    env.__memory_base = round_up_align(env.__memory_base, memoryalignment);

    Object.assign(importObject.env, env);

    let instance = await WebAssembly.instantiate(module, importObject);
    dynamic_libraries[path] = instance;

    // Update values that will be used by next module
    env.__memory_base += memorysize;
    env.__table_base += tablesize;

    return instance;
}

function load_wasm(path) {
    let memory = new WebAssembly.Memory({initial: 1024});
    let  __indirect_function_table = new WebAssembly.Table({element: "anyfunc", initial: 0});
    // TODO determine sensible value for stack pointer (look at what lld does)
    let __stack_pointer = new WebAssembly.Global({value: "i32", mutable: true}, STACK_SIZE);
    let env = {
        memory: memory,
        __indirect_function_table: __indirect_function_table,
        __stack_pointer: __stack_pointer,
        __memory_base: STACK_SIZE,
        __table_base: 0,
        print_int: console.log
    };
    return load_wasm_module(path, env);
}

load_wasm("bin.wasm").then(instance => instance.exports.main());
