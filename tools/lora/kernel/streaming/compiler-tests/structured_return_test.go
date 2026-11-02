package wabt

import (
	"strings"
	"testing"

	"hikec-go/pkg/hir"
	"hikec-go/pkg/sema"
)

func TestStructuredScalarAndVoidReturnsDoNotUseDispatcher(t *testing.T) {
	for _, tc := range []struct {
		name   string
		types  []sema.Type
		values []hir.Value
		want   string
	}{
		{"integer", []sema.Type{sema.TypeInt32}, []hir.Value{&hir.ConstInt{Val: 23, Typ: sema.TypeInt32}}, "(return (i32.const 23))"},
		{"float", []sema.Type{sema.TypeFloat32}, []hir.Value{&hir.ConstFloat{Val: 1.25, Typ: sema.TypeFloat32}}, "(return (f32.const 1.25))"},
		{"void", nil, nil, "(return)"},
	} {
		t.Run(tc.name, func(t *testing.T) {
			body := hir.ControlBody{&hir.ReturnNode{Values: tc.values}}
			wat := New(&hir.Program{Functions: []*hir.Function{{Name: "answer", ReturnTypes: tc.types, StructuredBody: body}}}, nil).Emit()
			if strings.Contains(wat, "$cfg_dispatch") {
				t.Fatal("ordinary return forced the function through the CFG dispatcher")
			}
			if !strings.Contains(wat, tc.want) {
				t.Fatalf("expected return %q in generated WAT", tc.want)
			}
			if !strings.Contains(wat, "(global.set $__sp (local.get $frame_sp))") {
				t.Fatal("return did not restore the compiler stack")
			}
		})
	}
}
