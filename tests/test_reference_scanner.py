import hashlib
import importlib.util
import tempfile
import unittest
import json
from unittest.mock import patch
from pathlib import Path

ROOT=Path(__file__).resolve().parents[1]
spec=importlib.util.spec_from_file_location('reference_sync',ROOT/'scripts/sync-static.py')
sync=importlib.util.module_from_spec(spec);spec.loader.exec_module(sync)

class JavaScriptReferences(unittest.TestCase):
    def test_lexer_distinguishes_real_references_from_minified_string_contents(self):
        self.assertTrue(callable(getattr(sync,'javascript_references',None)), 'Token-aware JavaScript reference scanner missing')
        source=r"""const diagnostic='from'; const more='import("missing-string.mjs")';
        // import './missing-comment.mjs';
        /* fetch('./also-comment.json') */
        Array.from('array-value'); function from(v){return v;} from('function-value');
        import{x}from'./real.mjs'; export{x}from'./reexport.mjs';
        import('./dynamic.mjs'); new URL('./kernel.wasm',import.meta.url); fetch('./data.json');
        const pattern=/from["']|import\(foo\)/g;
        """
        self.assertEqual(list(sync.javascript_references(source)), [('import','./real.mjs'),('import','./reexport.mjs'),('import','./dynamic.mjs'),('url','./kernel.wasm'),('fetch','./data.json')])

    def test_escaped_literal_traversal_is_still_rejected(self):
        with tempfile.TemporaryDirectory() as tmp:
            p=Path(tmp);(p/'app.mjs').write_text(r"import '.\x2e/outside.mjs';")
            with self.assertRaisesRegex(ValueError,'Broken/escaping'):
                sync.check_references(p,exceptions=[])

    def test_genuine_missing_dependency_is_not_ignored(self):
        with tempfile.TemporaryDirectory() as tmp:
            p=Path(tmp);(p/'app.mjs').write_text("import './missing.mjs';")
            with self.assertRaisesRegex(ValueError,'Broken/escaping'):
                sync.check_references(p,exceptions=[])

    def test_vendor_builtin_exception_requires_exact_path_bytes_and_specifier(self):
        with tempfile.TemporaryDirectory() as tmp:
            p=Path(tmp);vendor=p/'shared/inference/vendor/runtime.mjs';vendor.parent.mkdir(parents=True)
            content="if(typeof process==='object')await import('module');"
            vendor.write_text(content)
            records=[{'file':'shared/inference/vendor/runtime.mjs','sha256':hashlib.sha256(content.encode()).hexdigest(),'specifiers':['module'],'reason':'Pinned vendor Node-only branch; browser path separately tested'}]
            sync.check_references(p,exceptions=records)
            vendor.write_text(content+'\n// changed')
            with self.assertRaisesRegex(ValueError,'hash|Broken/escaping'):
                sync.check_references(p,exceptions=records)
            vendor.write_text(content);(p/'app.mjs').write_text("import 'module';")
            with self.assertRaisesRegex(ValueError,'Broken/escaping'):
                sync.check_references(p,exceptions=records)

    def test_node_scheme_import_is_not_a_general_browser_bypass(self):
        with tempfile.TemporaryDirectory() as tmp:
            p=Path(tmp);(p/'app.mjs').write_text("import 'node:module';")
            with self.assertRaisesRegex(ValueError,'Node-only'):
                sync.check_references(p,exceptions=[])

    def test_asset_base_url_directory_does_not_authorize_missing_page_or_fetch(self):
        with tempfile.TemporaryDirectory() as tmp:
            p=Path(tmp);(p/'vendor').mkdir();app=p/'app.mjs'
            app.write_text("new URL('.',import.meta.url);new URL('./vendor/',import.meta.url);")
            sync.check_references(p,exceptions=[])
            app.write_text("fetch('./vendor/');")
            with self.assertRaisesRegex(ValueError,'Broken/escaping'): sync.check_references(p,exceptions=[])
            app.write_text('');(p/'index.html').write_text('<a href="./vendor/">x</a>')
            with self.assertRaisesRegex(ValueError,'Broken/escaping'): sync.check_references(p,exceptions=[])

    def test_reference_exception_policy_changed_during_export_aborts(self):
        with tempfile.TemporaryDirectory() as tmp:
            p=Path(tmp);source=p/'source';source.mkdir();(source/'.nojekyll').write_text('');(source/'index.html').write_text('<p>reviewed</p>')
            registry=p/'registry.json';registry.write_text(json.dumps({'version':1,'target':'github-pages','files':['.nojekyll','index.html']}))
            policy=p/'exceptions.json';policy.write_text(json.dumps({'version':1,'exceptions':[]}))
            original=sync.check_references
            def mutate(root):
                original(root);policy.write_text(policy.read_text()+' ')
            with patch.object(sync,'REFERENCE_EXCEPTIONS',policy),patch.object(sync,'check_references',side_effect=mutate):
                with self.assertRaisesRegex(ValueError,'Reference exceptions changed'):
                    sync.export(source,p/'out',registry)
            self.assertFalse((p/'out').exists())

if __name__=='__main__':unittest.main()
