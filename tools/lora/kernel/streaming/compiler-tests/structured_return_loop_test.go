package compiler

import (
	"context"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"testing"
	"time"

	"hikec-go/pkg/target"
)

func TestStructuredReturnAndLoopInitRunInWasm(t *testing.T) {
	assembler, err := exec.LookPath("wat2wasm")
	if err != nil {
		t.Skip("wat2wasm unavailable")
	}
	node, err := exec.LookPath("node")
	if err != nil {
		t.Skip("node unavailable")
	}
	root := t.TempDir()
	source := filepath.Join(root, "loop.hike")
	if err := os.WriteFile(source, []byte(`package main
cfunc Count(n int32) int32 {
    if n < 1 { return -1 }
    var sum int32 = 0
    for i := int32(0); i < n; i = i + 1 { sum = sum + i }
    return sum
}
cfunc Nested(n int32) int32 {
    var sum int32 = 0
    var j int32 = 0
    for i := int32(0); i < n; i = i + 1 {
        j = 0
        for j < n { sum = sum + i + j; j = j + 1 }
    }
    return sum
}
func main() int { return 0 }
`), 0644); err != nil {
		t.Fatal(err)
	}
	tgt := target.TargetWabt
	wat, _, _, err := New(&tgt).CompileToWAT(source)
	if err != nil {
		t.Fatal(err)
	}
	if strings.Contains(wat, "$cfg_dispatch") {
		t.Fatal("return and ordinary loops unexpectedly require CFG dispatcher")
	}
	watPath, wasmPath := filepath.Join(root, "loop.wat"), filepath.Join(root, "loop.wasm")
	if err := os.WriteFile(watPath, []byte(wat), 0644); err != nil {
		t.Fatal(err)
	}
	if out, err := exec.Command(assembler, watPath, "-o", wasmPath).CombinedOutput(); err != nil {
		t.Fatalf("invalid WAT: %v\n%s", err, out)
	}
	ctx, cancel := context.WithTimeout(context.Background(), 3*time.Second)
	defer cancel()
	script := `const fs=require('node:fs'); const e=new WebAssembly.Instance(new WebAssembly.Module(fs.readFileSync(process.argv[1])),{}).exports; for(const [name,n,want]of [['Count',5,10],['Count',1,0],['Count',0,-1],['Nested',3,18],['Nested',1,0],['Nested',0,0]]){const actual=e[name](n);if(actual!==want)throw Error(name+'('+n+')='+actual+', expected '+want);}`
	if out, err := exec.CommandContext(ctx, node, "-e", script, wasmPath).CombinedOutput(); err != nil {
		t.Fatalf("structured loop/return execution failed: %v (timeout=%v)\n%s", err, ctx.Err(), out)
	}
}
