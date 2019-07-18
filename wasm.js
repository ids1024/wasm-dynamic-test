const fs = require('fs');

function read_varuint32(array, idx) {
    var value = 0;
    var count = 0;
    while (count < 5) {
        var b = array[idx + count];
        value |= (b & 0x7f) << (7 * count);
        count++;
        if ((b & 0x80) == 0) {
            break;
        }
    }
    return [value, idx + count];
}

dynamic_libraries = {};

async function load_dynamic_wasm(path, env) {
    if (dynamic_libraries[path] !== undefined) {
        return dynamic_libaries[path];
    }

    var data = fs.readFileSync(path);
    var module = await WebAssembly.compile(data);

    var dylink = WebAssembly.Module.customSections(module, "dylink");
    dylink_array = new Uint8Array(dylink[0]);

    var idx = 0;
    var [memorysize, idx] = read_varuint32(dylink_array, idx);
    var [memoryalignment, idx] = read_varuint32(dylink_array, idx);
    var [tablesize, idx] = read_varuint32(dylink_array, idx);
    var [tablealignment, idx] = read_varuint32(dylink_array, idx);
    var [needed_dynlibs_count, idx] = read_varuint32(dylink_array, idx);

    importObject = {"env": {}};
    Object.assign(importObject.env, env);

    var utf8decoder = new TextDecoder(); 
    for (var i = 0; i < needed_dynlibs_count; i++) {
        var [length, idx] = read_varuint32(dylink_array, idx);
        let path = utf8decoder.decode(dylink[0].slice(idx, idx + length));
        var library = await load_dynamic_wasm(path, env);
        Object.assign(importObject.env, library.exports);
        idx += length;
    }


    var instance = await WebAssembly.instantiate(module, importObject);
    dynamic_libraries[path] = instance;
    return instance;
}

var memory = new WebAssembly.Memory({'initial': 1024});
__indirect_function_table = new WebAssembly.Table({element: "anyfunc", initial: 0});
// TODO determine sensible value for stack pointer (look at what lld does)
__stack_pointer = new WebAssembly.Global({value: "i32", mutable: true}, 1024);
env = {
    "memory": memory,
    "__indirect_function_table": __indirect_function_table,
    "__stack_pointer": __stack_pointer,
    "__memory_base": 0,
    "__table_base": 0,
    "print_int": console.log
}

load_dynamic_wasm("bin.wasm", env).then(instance => instance.exports.main());
