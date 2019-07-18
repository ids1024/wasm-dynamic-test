// This is not necessarily a complete implementation of a dynamic loader, nor
// is it well tested.

const fs = require('fs');

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
    Object.assign(importObject.env, env);

    let utf8decoder = new TextDecoder(); 
    for (var i = 0; i < needed_dynlibs_count; i++) {
        let length;
        [length, idx] = read_varuint32(dylink_array, idx);
        let path = utf8decoder.decode(dylink[0].slice(idx, idx + length));
        let library = await load_wasm_module(path, env);
        Object.assign(importObject.env, library.exports);
        idx += length;
    }


    let instance = await WebAssembly.instantiate(module, importObject);
    dynamic_libraries[path] = instance;
    return instance;
}

function load_wasm(path) {
    let memory = new WebAssembly.Memory({initial: 1024});
    let  __indirect_function_table = new WebAssembly.Table({element: "anyfunc", initial: 0});
    // TODO determine sensible value for stack pointer (look at what lld does)
    let __stack_pointer = new WebAssembly.Global({value: "i32", mutable: true}, 1024);
    let env = {
        memory: memory,
        __indirect_function_table: __indirect_function_table,
        __stack_pointer: __stack_pointer,
        __memory_base: 0,
        __table_base: 0,
        print_int: console.log
    };
    return load_wasm_module(path, env);
}

load_wasm("bin.wasm").then(instance => instance.exports.main());
