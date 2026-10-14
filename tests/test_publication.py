import importlib.util
import json
import shutil
import tempfile
import unittest
from unittest.mock import patch
from pathlib import Path

ROOT=Path(__file__).resolve().parents[1]
spec=importlib.util.spec_from_file_location('sync',ROOT/'scripts/sync-static.py')
sync=importlib.util.module_from_spec(spec);spec.loader.exec_module(sync)

class PublicationTests(unittest.TestCase):
    def setUp(self):
        self.temp=tempfile.TemporaryDirectory();self.root=Path(self.temp.name)
        self.source=self.root/'source';shutil.copytree(ROOT/'docs',self.source)
        self.out=self.root/'out'
    def tearDown(self):self.temp.cleanup()
    def rejected(self):
        with self.assertRaises(ValueError):sync.export(self.source,self.out)
        self.assertFalse(self.out.exists())
    def test_valid_export(self):
        sync.export(self.source,self.out)
        self.assertEqual(sync.inventory(self.out),sync.approved())
        self.assertFalse((self.out/'ft-workbench').exists())
    def test_unknown_private_file(self):
        (self.source/'private.txt').write_text('PRIVATE MARKER');self.rejected()
    def test_unknown_empty_directory(self):
        (self.source/'private-empty').mkdir();self.rejected()
    def test_missing_dependency(self):
        (self.source/'shared/ft/kernel/ft-kernel.wasm').unlink();self.rejected()
    def test_symlink_file(self):
        p=self.source/'index.html';p.unlink();p.symlink_to(ROOT/'docs/index.html');self.rejected()
    def test_symlink_directory(self):
        (self.source/'hidden').symlink_to(ROOT/'security',target_is_directory=True);self.rejected()
    def test_symlink_source(self):
        alias=self.root/'alias';alias.symlink_to(self.source,target_is_directory=True)
        with self.assertRaises(ValueError):sync.export(alias,self.out)
    def test_existing_output_preserved(self):
        self.out.mkdir();(self.out/'marker').write_text('old')
        with self.assertRaises(ValueError):sync.export(self.source,self.out)
        self.assertEqual((self.out/'marker').read_text(),'old')
    def test_reference_escape(self):
        (self.source/'index.html').write_text('<a href="../private.txt">x</a>');self.rejected()
    def test_missing_module_reference(self):
        p=self.source/'animator-composer/worker.mjs';p.write_text(p.read_text()+"\nimport './missing.mjs';\n");self.rejected()
    def test_no_failed_stage_remains(self):
        (self.source/'index.html').write_text('<a href="missing.html">x</a>');self.rejected()
        self.assertFalse(list(self.root.glob('.pages-stage-*')))
    def test_source_changed_after_copy(self):
        original=sync.check_references
        def mutate(root):
            original(root)
            p=self.source/'index.html';p.write_text(p.read_text()+'<!-- changed -->')
        with patch.object(sync,'check_references',side_effect=mutate):self.rejected()
    def test_registry_changed_during_export(self):
        registry=self.root/'registry.json';shutil.copyfile(sync.REGISTRY,registry)
        original=sync.check_references
        def mutate(root):
            original(root);registry.write_text(registry.read_text()+' ')
        with patch.object(sync,'check_references',side_effect=mutate):
            with self.assertRaises(ValueError):sync.export(self.source,self.out,registry)
        self.assertFalse(self.out.exists())
    def test_registry_traversal_and_collisions(self):
        for extra in ['../secret','/secret','a\\b','a//b','%2e%2e/secret','INDEX.HTML','index.html/child','a?b','a#b','a\x7fb','e\u0301']:
            with self.subTest(extra=extra):
                r=self.root/'registry.json';d=json.loads(sync.REGISTRY.read_text());d['files'].append(extra);r.write_text(json.dumps(d))
                with self.assertRaises(ValueError):sync.approved(r)
    def test_no_retired_links(self):
        for p in self.source.rglob('*'):
            if p.suffix in ('.html','.mjs'):
                self.assertNotIn('ft-workbench',p.read_text())

if __name__=='__main__':unittest.main()
