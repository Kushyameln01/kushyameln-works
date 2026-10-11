// Copy into the target project's Assets/Editor folder and run:
// Tools/FT Hike/Validate Generated Import
// This reads imported assets only; it does not modify the avatar or assets.
using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using UnityEditor;
using UnityEditor.Animations;
using UnityEngine;

public static class FTHikeImportAudit
{
    private const string Root = "Assets/KushyamelnFT_Hike_r11";

    // These field names follow GenerationSpec.json (ft-hike-generation-spec-1).
    // JsonUtility ignores the provenance fields; the audit reads the contract
    // and compares it with imported objects, without an SDK or MA assembly reference.
    [Serializable]
    private sealed class GenerationSpec
    {
        public string format;
        public int revision;
        public ParameterContract parameter_contract;
    }

    [Serializable]
    private sealed class ParameterContract
    {
        public int schema_version;
        public string output_root;
        public ParameterDefinition[] parameters;
    }

    [Serializable]
    private sealed class ParameterDefinition
    {
        public string name;
        public string role;
        public ExternalDefinition external;
        public AnimatorDefinition[] animator;
    }

    [Serializable]
    private sealed class ExternalDefinition
    {
        public bool required;
        public string type;
        public float default_value;
        public bool saved;
        public bool network_synced;
    }

    [Serializable]
    private sealed class AnimatorDefinition
    {
        public string controller_guid;
        public string controller_file_id;
        public string controller_path;
        public string type;
        public float default_value;
        public string conversion;
    }

    [Serializable]
    private sealed class Check
    {
        public string path;
        public string expected;
        public string actual;
        public string guid;
        public long localFileId;
        public string status;
        public string detail;
    }

    [Serializable]
    private sealed class Result
    {
        public string root = Root;
        public string unityVersion = Application.unityVersion;
        public string generatedAtUtc = DateTime.UtcNow.ToString("O");
        public List<Check> checks = new List<Check>();
        public int pass;
        public int warn;
        public int fail;
        public string scope = "Imported generated assets only. MA build on an avatar with unset/empty Expression Parameters, OSC reception, and remote playback are NOT RUN by this audit.";
    }

    [MenuItem("Tools/FT Hike/Validate Generated Import")]
    public static void Run()
    {
        var result = new Result();
        var checks = result.checks;
        var contract = LoadContract(checks);
        foreach (var path in AssetDatabase.GetAllAssetPaths()
                     .Where(p => p.StartsWith(Root + "/", StringComparison.Ordinal) && !AssetDatabase.IsValidFolder(p))
                     .OrderBy(p => p, StringComparer.Ordinal))
        {
            if (path.EndsWith(".md", StringComparison.Ordinal))
            {
                checks.Add(new Check { path = path, expected = "Documentation", actual = "Markdown", status = File.Exists(path) ? "PASS" : "FAIL" });
                continue;
            }
            var expected = ExpectedType(path);
            var main = AssetDatabase.LoadMainAssetAtPath(path);
            var actual = main == null ? null : main.GetType();
            var check = new Check
            {
                path = path,
                expected = expected == null ? "UNVERIFIED" : expected.FullName,
                actual = actual == null ? "MISSING" : actual.FullName,
                status = expected != null && actual == expected ? "PASS" : "FAIL"
            };

            if (main != null)
                AssetDatabase.TryGetGUIDAndLocalFileIdentifier(main, out check.guid, out check.localFileId);
            if (expected == null)
                check.detail = "Expression Menu / Parameters class was not found in the loaded SDK assemblies.";
            else if (actual != expected)
                check.detail = "Main asset type does not match the expected Unity or VRChat type.";
            else if (main is BlendTree tree)
                CheckTree(tree, check);
            else if (main is AnimatorController controller)
                CheckController(controller, check);
            else if (main is AvatarMask mask)
                CheckMask(mask, check);
            else if (main is AnimationClip empty && empty.name == "Empty(nonloop)")
            {
                var settings = AnimationUtility.GetAnimationClipSettings(empty);
                var events = AnimationUtility.GetAnimationEvents(empty);
                if (settings.loopTime || empty.length != 0f || events.Length != 1 || events[0].time != 0f)
                { check.status = "FAIL"; check.detail = "Shared Empty must be nonloop, zero length, one event at zero."; }
            }
            else if (path.EndsWith("/ARKit_FT_Installed.prefab", StringComparison.Ordinal))
                CheckPrefab(path, contract, check);
            else if (path.EndsWith("/ARKit_FT_Parameters.asset", StringComparison.Ordinal))
                CheckRegistrations(new SerializedObject(main).FindProperty("parameters"), false, contract, check);

            checks.Add(check);
            foreach (var embedded in AssetDatabase.LoadAllAssetsAtPath(path).OfType<AvatarMask>().Where(candidate => candidate != main))
            {
                var subcheck = new Check { path = path + "#" + embedded.name,
                    expected = typeof(AvatarMask).FullName, actual = embedded.GetType().FullName, status = "PASS" };
                AssetDatabase.TryGetGUIDAndLocalFileIdentifier(embedded, out subcheck.guid, out subcheck.localFileId);
                CheckMask(embedded, subcheck);
                checks.Add(subcheck);
            }
        }

        CheckRequiredMotion("EyeXY_Shape_Root", "ARKit_FT_FX_Hike", "EyeXY_Shape", new[] { "Eye_Root" }, checks);
        CheckRequiredMotion("FaceTrack_Additive_Root", "Additive+C_Maho", "FaceTrack_Additive", new[] { "Direct", "Safety" }, checks);
        if (contract != null) CheckAnimatorContract(contract, checks);
        foreach (var required in new[] { "/Installer/ARKit_FT_Installed.prefab", "/Installer/ARKit_FT_Parameters.asset" })
            if (AssetDatabase.LoadMainAssetAtPath(Root + required) == null)
                checks.Add(new Check { path = Root + required, status = "FAIL", detail = "Required registration asset did not load." });
        result.pass = checks.Count(c => c.status == "PASS");
        result.warn = checks.Count(c => c.status == "WARN");
        result.fail = checks.Count(c => c.status == "FAIL");
        var output = Path.GetFullPath(Path.Combine(Application.dataPath, "../Library/ft-hike-import-audit.json"));
        Directory.CreateDirectory(Path.GetDirectoryName(output));
        File.WriteAllText(output, JsonUtility.ToJson(result, true));
        Debug.Log($"FT Hike import audit: PASS {result.pass}, WARN {result.warn}, FAIL {result.fail}. Report: {output}");
    }

    private static Type ExpectedType(string path)
    {
        if (path.EndsWith(".json", StringComparison.Ordinal)) return typeof(TextAsset);
        if (path.EndsWith(".controller", StringComparison.Ordinal)) return typeof(AnimatorController);
        if (path.EndsWith(".anim", StringComparison.Ordinal)) return typeof(AnimationClip);
        if (path.EndsWith(".prefab", StringComparison.Ordinal)) return typeof(GameObject);
        if (path.EndsWith(".mask", StringComparison.Ordinal)) return typeof(AvatarMask);
        if (path.EndsWith("/ARKit_FT_Menu.asset", StringComparison.Ordinal) || path.EndsWith("/RootMenu.asset", StringComparison.Ordinal))
            return FindType("VRC.SDK3.Avatars.ScriptableObjects.VRCExpressionsMenu");
        if (path.EndsWith("/ARKit_FT_Parameters.asset", StringComparison.Ordinal))
            return FindType("VRC.SDK3.Avatars.ScriptableObjects.VRCExpressionParameters");
        if (path.EndsWith(".asset", StringComparison.Ordinal)) return typeof(BlendTree);
        return null;
    }

    private static Type FindType(string fullName)
    {
        foreach (var assembly in AppDomain.CurrentDomain.GetAssemblies())
        {
            var type = assembly.GetType(fullName, false);
            if (type != null) return type;
        }
        return null;
    }

    private static void CheckTree(BlendTree tree, Check check)
    {
        var missing = CountMissingChildren(tree, new HashSet<BlendTree>());
        if (missing > 0)
        {
            check.status = "FAIL";
            check.detail = $"{missing} BlendTree child Motion reference(s) are missing.";
        }
    }

    private static int CountMissingChildren(BlendTree tree, HashSet<BlendTree> visited)
    {
        if (!visited.Add(tree)) return 0;
        var missing = 0;
        foreach (var child in tree.children)
        {
            if (child.motion == null) missing++;
            else if (child.motion is BlendTree nested) missing += CountMissingChildren(nested, visited);
        }
        return missing;
    }

    private static void CheckController(AnimatorController controller, Check check)
    {
        if (AssetDatabase.GetAssetPath(controller) != Root + "/Modules/Controllers/" + controller.name + ".controller")
        { check.status = "FAIL"; check.detail = "Controller is outside Modules/Controllers."; }
        foreach (var name in new[] { "v2/EyeLidLeft", "v2/EyeLidRight" })
        {
            var values = controller.parameters.Where(p => p.name == name).ToArray();
            if (controller.name == "ARKit_FT_FX_Hike" &&
                (values.Length != 1 || values[0].type != AnimatorControllerParameterType.Float || values[0].defaultFloat != 0.75f))
            { check.status = "FAIL"; check.detail += " Incorrect eyelid default: " + name; }
        }
        if (controller.parameters.Any(p => p.name == "v2/EyeX" || p.name == "EyeX_Weight"))
        { check.status = "FAIL"; check.detail += " Obsolete eye declaration remains."; }
        var missing = 0;
        foreach (var layer in controller.layers)
            CheckStateMachine(layer.stateMachine, ref missing, new HashSet<AnimatorStateMachine>());
        if (missing > 0)
        {
            check.status = "FAIL";
            check.detail = $"{missing} Animator State Motion reference(s) are missing.";
        }
        var entries = new HashSet<BlendTree>();
        foreach (var layer in controller.layers)
        {
            CollectEntryTrees(layer.stateMachine, entries, new HashSet<AnimatorStateMachine>());
            if (layer.avatarMask != null && AssetDatabase.IsSubAsset(layer.avatarMask))
            { check.status = "FAIL"; check.detail += " Layer has an embedded AvatarMask."; }
        }
        foreach (var entry in entries)
        {
            var path = AssetDatabase.GetAssetPath(entry);
            if (path != Root + "/Modules/Source/Root/" + entry.name + ".asset" || AssetDatabase.IsSubAsset(entry))
            { check.status = "FAIL"; check.detail += " Entry tree is outside Source/Root: " + entry.name; }
        }
        var expectedEntries = controller.name == "ARKit_FT_FX_Hike" ? 8 : 1;
        if (entries.Count != expectedEntries)
        { check.status = "FAIL"; check.detail += " Unexpected unique entry tree count: " + entries.Count; }
        var constants = controller.parameters.Where(p => p.name == "OSCm/BlendSet").ToArray();
        if (constants.Length != 1 || constants[0].type != AnimatorControllerParameterType.Float || constants[0].defaultFloat != 1f ||
            controller.parameters.Any(p => p.name == "AlwaysOne"))
        {
            check.status = "FAIL";
            check.detail += " Constant weight must have exactly one OSCm/BlendSet Float=1 declaration and no AlwaysOne.";
        }
    }

    private static void CollectEntryTrees(AnimatorStateMachine machine, HashSet<BlendTree> entries, HashSet<AnimatorStateMachine> visited)
    {
        if (machine == null || !visited.Add(machine)) return;
        foreach (var child in machine.states)
            if (child.state != null && child.state.motion is BlendTree tree) entries.Add(tree);
        foreach (var child in machine.stateMachines) CollectEntryTrees(child.stateMachine, entries, visited);
    }

    private static void CheckMask(AvatarMask mask, Check check)
    {
        var headOnly = mask.name == "HeadYes_OnlyHumanoidRig" || mask.name == "OnlyHead";
        if (AssetDatabase.IsSubAsset(mask))
        {
            check.status = "FAIL";
            check.detail = "AvatarMask must be a standalone external asset.";
            return;
        }
        if (!headOnly && mask.name != "Safety" && mask.name != "Safe") return;
        var mismatches = new List<string>();
        for (var i = 0; i < (int)AvatarMaskBodyPart.LastBodyPart; i++)
        {
            var part = (AvatarMaskBodyPart)i;
            if (mask.GetHumanoidBodyPartActive(part) != (headOnly && part == AvatarMaskBodyPart.Head))
                mismatches.Add(part.ToString());
        }
        if (mismatches.Count > 0)
        {
            check.status = "FAIL";
            check.detail = "Incorrect Humanoid mask flags: " + string.Join(", ", mismatches);
        }
        else check.detail = headOnly ? "Head only is enabled." : "All Humanoid parts are disabled.";
    }

    private static void CheckStateMachine(AnimatorStateMachine machine, ref int missing, HashSet<AnimatorStateMachine> visited)
    {
        if (machine == null || !visited.Add(machine)) return;
        foreach (var child in machine.states)
            if (child.state != null && child.state.motion == null) missing++;
        foreach (var child in machine.stateMachines)
            CheckStateMachine(child.stateMachine, ref missing, visited);
    }

    private static void CheckPrefab(string path, ParameterContract contract, Check check)
    {
        GameObject contents = null;
        try
        {
            contents = PrefabUtility.LoadPrefabContents(path);
            var missing = GameObjectUtility.GetMonoBehavioursWithMissingScriptCount(contents);
            if (missing > 0)
            {
                check.status = "FAIL";
                check.detail = $"{missing} missing MonoBehaviour script(s) in prefab.";
            }
            var merges = new Dictionary<int, string>();
            var parameterComponents = 0;
            var menuComponents = 0;
            foreach (var component in contents.GetComponents<MonoBehaviour>().Where(c => c != null))
            {
                var serialized = new SerializedObject(component);
                if (component.GetType().Name == "ModularAvatarMergeAnimator")
                {
                    var target = serialized.FindProperty("animator").objectReferenceValue;
                    var layer = serialized.FindProperty("layerType").intValue;
                    if (target == null || merges.ContainsKey(layer))
                    { check.status = "FAIL"; check.detail += " Missing/duplicate merge target."; }
                    else merges[layer] = AssetDatabase.GetAssetPath(target);
                    if (serialized.FindProperty("pathMode").intValue != 1 || serialized.FindProperty("mergeAnimatorMode").intValue != 0)
                    { check.status = "FAIL"; check.detail += " Merge must be Absolute/Append."; }
                }
                else if (component.GetType().Name == "ModularAvatarMenuInstaller")
                {
                    menuComponents++;
                    var menu = serialized.FindProperty("menuToAppend").objectReferenceValue;
                    if (menu == null || AssetDatabase.GetAssetPath(menu) != Root + "/Installer/RootMenu.asset")
                    { check.status = "FAIL"; check.detail += " Grouped RootMenu is missing."; }
                }
                else if (component.GetType().Name == "ModularAvatarParameters")
                {
                    parameterComponents++;
                    var parameters = serialized.FindProperty("parameters");
                    CheckRegistrations(parameters, true, contract, check);
                }
            }
            if (parameterComponents != 1 || menuComponents != 1)
                Fail(check, "Installer must contain exactly one MA Parameters and one MA Menu Installer component.");
            if (merges.Count != 2 || !merges.TryGetValue(5, out var fx) || fx != Root + "/Modules/Controllers/ARKit_FT_FX_Hike.controller" ||
                !merges.TryGetValue(2, out var additive) || additive != Root + "/Modules/Controllers/Additive+C_Maho.controller")
            { check.status = "FAIL"; check.detail += " Installer must include both FX and Additive."; }
        }
        catch (Exception exception)
        {
            check.status = "FAIL";
            check.detail = exception.Message;
        }
        finally
        {
            if (contents != null) PrefabUtility.UnloadPrefabContents(contents);
        }
    }

    private static void CheckRegistrations(SerializedProperty parameters, bool modularAvatar, ParameterContract contract, Check check)
    {
        if (contract == null) { Fail(check, "GenerationSpec contract is unavailable; registrations were not verified."); return; }
        if (parameters == null || !parameters.isArray) { Fail(check, "Parameter array is missing."); return; }
        var expected = contract.parameters.Where(p => p.external.required).ToDictionary(p => p.name, p => p.external);
        var seen = new HashSet<string>();
        for (var i = 0; i < parameters.arraySize; i++)
        {
            var entry = parameters.GetArrayElementAtIndex(i);
            var name = entry.FindPropertyRelative(modularAvatar ? "nameOrPrefix" : "name").stringValue;
            if (!seen.Add(name)) { Fail(check, "Duplicate registration: " + name); continue; }
            if (!expected.TryGetValue(name, out var definition)) { Fail(check, "Registration outside the external contract: " + name); continue; }
            var type = entry.FindPropertyRelative(modularAvatar ? "syncType" : "valueType").intValue;
            var value = entry.FindPropertyRelative("defaultValue").floatValue;
            var saved = entry.FindPropertyRelative("saved").boolValue;
            var synced = modularAvatar ? !entry.FindPropertyRelative("localOnly").boolValue : entry.FindPropertyRelative("networkSynced").boolValue;
            var expectedType = definition.type == "Int" ? (modularAvatar ? 1 : 0) :
                definition.type == "Float" ? (modularAvatar ? 2 : 1) : definition.type == "Bool" ? (modularAvatar ? 3 : 2) : -1;
            if (type != expectedType || value != definition.default_value || saved != definition.saved || synced != definition.network_synced)
                Fail(check, "Registration type/default/saved/sync differs from contract: " + name);
            if (modularAvatar)
            {
                if (entry.FindPropertyRelative("isPrefix").boolValue || entry.FindPropertyRelative("internalParameter").boolValue ||
                    !string.IsNullOrEmpty(entry.FindPropertyRelative("remapTo").stringValue) ||
                    !entry.FindPropertyRelative("hasExplicitDefaultValue").boolValue || entry.FindPropertyRelative("m_overrideAnimatorDefaults").boolValue)
                    Fail(check, "MA name scope/remap/default policy differs from this generated contract: " + name);
            }
        }
        foreach (var name in expected.Keys.Where(name => !seen.Contains(name))) Fail(check, "Missing external registration: " + name);
    }

    private static ParameterContract LoadContract(List<Check> checks)
    {
        var check = new Check { path = Root + "/GenerationSpec.json", expected = "ft-hike-generation-spec-1 / parameter schema 1", status = "PASS" };
        checks.Add(check);
        try
        {
            var asset = AssetDatabase.LoadAssetAtPath<TextAsset>(check.path);
            if (asset == null) throw new InvalidDataException("GenerationSpec.json did not load as TextAsset.");
            var spec = JsonUtility.FromJson<GenerationSpec>(asset.text);
            if (spec == null || spec.format != "ft-hike-generation-spec-1" || spec.revision != 13)
                throw new InvalidDataException("Unsupported generation spec format/revision.");
            var contract = spec.parameter_contract;
            if (contract == null || contract.schema_version != 1 || contract.output_root != Root || contract.parameters == null || contract.parameters.Length == 0)
                throw new InvalidDataException("Missing or incompatible parameter contract.");
            var names = new HashSet<string>();
            foreach (var parameter in contract.parameters)
            {
                if (parameter == null || string.IsNullOrEmpty(parameter.name) || !names.Add(parameter.name) || parameter.external == null || parameter.animator == null)
                    throw new InvalidDataException("Invalid/duplicate parameter definition.");
                if (parameter.external.required && !new[] { "Int", "Float", "Bool" }.Contains(parameter.external.type))
                    throw new InvalidDataException("Unsupported external type: " + parameter.name);
                foreach (var animator in parameter.animator)
                    if (animator == null || string.IsNullOrEmpty(animator.controller_path) || !animator.controller_path.StartsWith(Root + "/Modules/Controllers/", StringComparison.Ordinal) ||
                        string.IsNullOrEmpty(animator.controller_guid) || string.IsNullOrEmpty(animator.controller_file_id) ||
                        !new[] { "Int", "Float", "Bool", "Trigger" }.Contains(animator.type))
                        throw new InvalidDataException("Invalid Animator definition: " + parameter.name);
            }
            if (!contract.parameters.Any(p => p.external.required))
                throw new InvalidDataException("The generated FT contract contains no required external parameters.");
            check.actual = "revision " + spec.revision + "; " + contract.parameters.Count(p => p.external.required) + " external parameters";
            return contract;
        }
        catch (Exception exception) { Fail(check, exception.Message); return null; }
    }

    private static void CheckAnimatorContract(ParameterContract contract, List<Check> checks)
    {
        foreach (var group in contract.parameters.SelectMany(p => p.animator.Select(a => new { parameter = p, declaration = a }))
                     .GroupBy(x => x.declaration.controller_path).OrderBy(g => g.Key, StringComparer.Ordinal))
        {
            var check = new Check { path = group.Key, expected = "Animator declarations from GenerationSpec", status = "PASS" };
            checks.Add(check);
            var controller = AssetDatabase.LoadAssetAtPath<AnimatorController>(group.Key);
            if (controller == null) { Fail(check, "Controller did not load."); continue; }
            AssetDatabase.TryGetGUIDAndLocalFileIdentifier(controller, out check.guid, out check.localFileId);
            var seen = new HashSet<string>();
            foreach (var item in group)
            {
                var definition = item.declaration;
                var name = item.parameter.name;
                var found = controller.parameters.Where(p => p.name == name).ToArray();
                if (!seen.Add(name) || found.Length != 1) { Fail(check, "Missing/duplicate declaration: " + name); continue; }
                var parameter = found[0];
                var value = parameter.type == AnimatorControllerParameterType.Float ? parameter.defaultFloat :
                    parameter.type == AnimatorControllerParameterType.Int ? parameter.defaultInt : parameter.defaultBool ? 1f : 0f;
                if (parameter.type.ToString() != definition.type || value != definition.default_value ||
                    check.guid != definition.controller_guid || check.localFileId.ToString(System.Globalization.CultureInfo.InvariantCulture) != definition.controller_file_id)
                    Fail(check, "Animator type/default/identity differs from contract: " + name);
                var external = item.parameter.external;
                if (external.required)
                {
                    var expectedConversion = external.type == definition.type ? "identity" :
                        external.type == "Bool" && definition.type == "Float" &&
                        (item.parameter.role == "network_bit" || item.parameter.role == "network_sign") ? "bool_to_float_0_1" : null;
                    if (expectedConversion == null || definition.conversion != expectedConversion || external.default_value != definition.default_value)
                        Fail(check, "Unsupported external/Animator correspondence: " + name);
                }
            }
        }
    }

    private static void CheckRequiredMotion(string rootName, string controllerName, string layerName, string[] stateNames, List<Check> checks)
    {
        var path = Root + "/Modules/Source/Root/" + rootName + ".asset";
        var check = new Check { path = path, expected = "Loaded main BlendTree 20600000, connected State motions, nonnull descendants", status = "PASS" };
        checks.Add(check);
        var motion = AssetDatabase.LoadAssetAtPath<Motion>(path);
        var main = AssetDatabase.LoadMainAssetAtPath(path);
        check.actual = motion == null ? "MISSING" : motion.GetType().FullName;
        if (!(motion is BlendTree tree) || main != motion) { Fail(check, "Root did not load as the main BlendTree Motion."); return; }
        AssetDatabase.TryGetGUIDAndLocalFileIdentifier(motion, out check.guid, out check.localFileId);
        if (check.localFileId != 20600000 || AssetDatabase.IsSubAsset(motion)) Fail(check, "Unexpected root local file ID/subasset status.");
        if (tree.children.Length != 2) Fail(check, "Expected the two original left/right child Motions.");
        CheckTree(tree, check);
        var controller = AssetDatabase.LoadAssetAtPath<AnimatorController>(Root + "/Modules/Controllers/" + controllerName + ".controller");
        var layers = controller == null ? new AnimatorControllerLayer[0] : controller.layers.Where(l => l.name == layerName).ToArray();
        if (layers.Length != 1) { Fail(check, "Expected owning controller/layer did not load uniquely."); return; }
        var states = new List<AnimatorState>();
        CollectStates(layers[0].stateMachine, states, new HashSet<AnimatorStateMachine>());
        foreach (var name in stateNames)
        {
            var found = states.Where(s => s.name == name).ToArray();
            if (found.Length != 1 || found[0].motion != motion) Fail(check, "State does not reference the loaded root: " + name);
        }
    }

    private static void CollectStates(AnimatorStateMachine machine, List<AnimatorState> states, HashSet<AnimatorStateMachine> visited)
    {
        if (machine == null || !visited.Add(machine)) return;
        states.AddRange(machine.states.Where(child => child.state != null).Select(child => child.state));
        foreach (var child in machine.stateMachines) CollectStates(child.stateMachine, states, visited);
    }

    private static void Fail(Check check, string message)
    {
        check.status = "FAIL";
        check.detail = string.IsNullOrEmpty(check.detail) ? message : check.detail + " " + message;
    }
}
