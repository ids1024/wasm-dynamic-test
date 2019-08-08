# Using emscripten target because of https://bugs.llvm.org/show_bug.cgi?id=42714
CFLAGS = --target=wasm32-unknown-emscripten -nostdlib
LDFLAGS = --shared --import-memory

all: bin.wasm

bin.wasm: bin.o lib.wasm
	wasm-ld $(LDFLAGS) --export=main -o $@ $< lib.wasm

lib.wasm: lib.o
	wasm-ld $(LDFLAGS) --export-all $^ -o $@

%.o: %.c lib.h
	clang $(CFLAGS) -c -fPIC -o $@ $<

lint:
	eslint wasm.js

clean:
	rm -f *.wasm *.o

.PHONY: all clean lint
