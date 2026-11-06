// Generated mirror of the five JSON Schemas; checked by test-descriptor.mjs.
export const schemas = {
  "module": {
    "type": "object",
    "properties": {
      "contractVersion": {
        "const": "works-module-contract/1.0-draft.1"
      },
      "moduleId": {
        "type": "string",
        "minLength": 1
      },
      "moduleVersion": {
        "type": "string",
        "minLength": 1
      },
      "implementationRef": {
        "$ref": "#/$defs/source"
      },
      "nativeAPI": {
        "$ref": "#/$defs/nativeAPI"
      },
      "adapterRef": {
        "anyOf": [
          {
            "type": "null"
          },
          {
            "type": "object",
            "properties": {
              "adapterId": {
                "type": "string",
                "minLength": 1
              },
              "adapterVersion": {
                "type": "string",
                "minLength": 1
              },
              "sourceRef": {
                "$ref": "#/$defs/source"
              }
            },
            "required": [
              "adapterId",
              "adapterVersion",
              "sourceRef"
            ],
            "additionalProperties": true
          }
        ]
      },
      "operations": {
        "type": "array",
        "items": {
          "$ref": "#/$defs/operation"
        },
        "minItems": 1
      },
      "resourceContract": {
        "type": "object"
      },
      "cancellation": {
        "type": "object"
      },
      "evidenceRefs": {
        "type": "array",
        "items": {
          "type": "string",
          "minLength": 1
        }
      },
      "extensions": {
        "$ref": "#/$defs/extensions"
      }
    },
    "required": [
      "contractVersion",
      "moduleId",
      "moduleVersion",
      "implementationRef",
      "nativeAPI",
      "adapterRef",
      "operations",
      "resourceContract",
      "cancellation",
      "evidenceRefs",
      "extensions"
    ],
    "additionalProperties": false,
    "$schema": "https://json-schema.org/draft/2020-12/schema",
    "$id": "urn:kushyameln:works-module-contract:1.0-draft.1:module",
    "$defs": {
      "source": {
        "anyOf": [
          {
            "type": "object",
            "properties": {
              "repository": {
                "type": "string",
                "minLength": 1
              },
              "commit": {
                "type": "string",
                "pattern": "^[a-fA-F0-9]{40}$"
              },
              "path": {
                "type": "string",
                "minLength": 1
              }
            },
            "required": [
              "repository",
              "commit",
              "path"
            ],
            "additionalProperties": true
          },
          {
            "type": "object",
            "properties": {
              "archiveRef": {
                "type": "string",
                "minLength": 1
              },
              "sha256": {
                "type": "string",
                "pattern": "^[a-fA-F0-9]{64}$"
              }
            },
            "required": [
              "archiveRef",
              "sha256"
            ],
            "additionalProperties": true
          }
        ]
      },
      "schemaRef": {
        "type": "object",
        "properties": {
          "schemaId": {
            "type": "string",
            "minLength": 1
          },
          "schemaVersion": {
            "type": "string",
            "minLength": 1
          }
        },
        "required": [
          "schemaId",
          "schemaVersion"
        ],
        "additionalProperties": true
      },
      "identity": {
        "type": "object",
        "properties": {
          "identityKind": {
            "type": "string",
            "minLength": 1
          },
          "role": {
            "type": "string",
            "minLength": 1
          },
          "algorithm": {
            "type": "string",
            "minLength": 1
          },
          "value": {
            "type": "string",
            "minLength": 1
          },
          "scope": {
            "type": "string",
            "minLength": 1
          }
        },
        "required": [
          "identityKind",
          "role",
          "algorithm",
          "value",
          "scope"
        ],
        "additionalProperties": true
      },
      "nativeAPI": {
        "type": "object",
        "properties": {
          "version": {
            "type": "string",
            "minLength": 1
          },
          "build": {
            "anyOf": [
              {
                "type": "string",
                "minLength": 1
              },
              {
                "type": "null"
              }
            ]
          },
          "transport": {
            "type": "string",
            "minLength": 1
          },
          "entrypoint": {
            "type": "string",
            "minLength": 1
          }
        },
        "required": [
          "version",
          "build",
          "transport",
          "entrypoint"
        ],
        "additionalProperties": true
      },
      "semantics": {
        "type": "object",
        "properties": {
          "schemaId": {
            "type": "string",
            "minLength": 1
          },
          "schemaVersion": {
            "type": "string",
            "minLength": 1
          },
          "spaceId": {
            "type": "string",
            "minLength": 1
          },
          "unit": {},
          "normalization": {}
        },
        "required": [
          "schemaId",
          "schemaVersion",
          "spaceId"
        ],
        "additionalProperties": true
      },
      "extension": {
        "type": "object",
        "properties": {
          "schemaId": {
            "type": "string",
            "minLength": 1
          },
          "schemaVersion": {
            "type": "string",
            "minLength": 1
          },
          "requiredForUse": {
            "type": "boolean"
          },
          "data": {}
        },
        "required": [
          "schemaId",
          "schemaVersion",
          "requiredForUse",
          "data"
        ],
        "additionalProperties": true
      },
      "extensions": {
        "type": "object",
        "propertyNames": {
          "pattern": "^[^:]+:.+$"
        },
        "additionalProperties": {
          "$ref": "#/$defs/extension"
        }
      },
      "tensorPort": {
        "type": "object",
        "properties": {
          "dtypes": {
            "type": "array",
            "items": {
              "type": "string",
              "minLength": 1
            },
            "minItems": 1
          },
          "axes": {
            "type": "array",
            "items": {
              "type": "string",
              "minLength": 1
            },
            "minItems": 1
          },
          "shape": {
            "type": "array",
            "items": {
              "anyOf": [
                {
                  "type": "integer",
                  "minimum": 1
                },
                {
                  "type": "null"
                }
              ]
            },
            "minItems": 1
          },
          "maxElements": {
            "type": "integer",
            "minimum": 0
          },
          "maxBytes": {
            "type": "integer",
            "minimum": 0
          }
        },
        "required": [
          "dtypes",
          "axes",
          "shape"
        ],
        "additionalProperties": true
      },
      "tensorArtifact": {
        "type": "object",
        "properties": {
          "dtype": {
            "type": "string",
            "minLength": 1
          },
          "shape": {
            "type": "array",
            "items": {
              "type": "integer",
              "minimum": 1
            },
            "minItems": 1
          },
          "axes": {
            "type": "array",
            "items": {
              "type": "string",
              "minLength": 1
            },
            "minItems": 1
          },
          "nativeMeaning": {
            "type": "string",
            "minLength": 1
          },
          "dataRef": {
            "type": "string",
            "minLength": 1
          }
        },
        "required": [
          "dtype",
          "shape",
          "axes",
          "nativeMeaning",
          "dataRef"
        ],
        "additionalProperties": true
      },
      "port": {
        "type": "object",
        "properties": {
          "portId": {
            "type": "string",
            "minLength": 1
          },
          "bindingRef": {
            "type": "string",
            "minLength": 1
          },
          "owner": {
            "type": "string",
            "minLength": 1
          },
          "sourceRef": {
            "$ref": "#/$defs/source"
          },
          "nativeAPI": {
            "$ref": "#/$defs/nativeAPI"
          },
          "artifactKind": {
            "type": "string",
            "minLength": 1
          },
          "semantics": {
            "$ref": "#/$defs/semantics"
          },
          "profileRef": {
            "type": "string",
            "minLength": 1
          },
          "tensor": {
            "$ref": "#/$defs/tensorPort"
          },
          "requiredMetadata": {
            "type": "array",
            "items": {
              "type": "string",
              "pattern": "^(?:/(?:[^~]|~[01])*)*$"
            }
          },
          "requiredIdentities": {
            "type": "array",
            "items": {
              "$ref": "#/$defs/identity"
            }
          },
          "ownershipModes": {
            "type": "array",
            "items": {
              "enum": [
                "copy",
                "transfer",
                "borrow",
                "lease"
              ]
            },
            "minItems": 1
          },
          "transports": {
            "type": "array",
            "items": {
              "type": "string",
              "minLength": 1
            },
            "minItems": 1
          },
          "allowedAdapterRefs": {
            "type": "array",
            "items": {
              "type": "string",
              "minLength": 1
            }
          },
          "requiredExtensionSchemas": {
            "type": "array",
            "items": {
              "$ref": "#/$defs/schemaRef"
            }
          }
        },
        "required": [
          "portId",
          "bindingRef",
          "owner",
          "sourceRef",
          "nativeAPI",
          "artifactKind",
          "semantics",
          "profileRef",
          "requiredMetadata",
          "requiredIdentities",
          "ownershipModes",
          "transports",
          "allowedAdapterRefs",
          "requiredExtensionSchemas"
        ],
        "additionalProperties": true
      },
      "operation": {
        "type": "object",
        "properties": {
          "operationId": {
            "type": "string",
            "minLength": 1
          },
          "roles": {
            "type": "array",
            "items": {
              "type": "string",
              "minLength": 1
            },
            "minItems": 1
          },
          "inputPorts": {
            "type": "array",
            "items": {
              "$ref": "#/$defs/port"
            }
          },
          "outputPorts": {
            "type": "array",
            "items": {
              "$ref": "#/$defs/port"
            }
          },
          "implementationState": {
            "enum": [
              "implemented",
              "partial",
              "not-implemented",
              "unknown"
            ]
          },
          "constraints": {
            "type": "object"
          },
          "profileRefs": {
            "type": "array",
            "items": {
              "type": "string",
              "minLength": 1
            }
          },
          "semanticSchemaRefs": {
            "type": "array",
            "items": {
              "$ref": "#/$defs/schemaRef"
            }
          }
        },
        "required": [
          "operationId",
          "roles",
          "inputPorts",
          "outputPorts",
          "implementationState",
          "constraints",
          "profileRefs",
          "semanticSchemaRefs"
        ],
        "additionalProperties": true
      },
      "artifactBinding": {
        "type": "object",
        "properties": {
          "portId": {
            "type": "string",
            "minLength": 1
          },
          "artifactRef": {
            "type": "string",
            "minLength": 1
          }
        },
        "required": [
          "portId",
          "artifactRef"
        ],
        "additionalProperties": true
      },
      "step": {
        "type": "object",
        "properties": {
          "stepId": {
            "type": "string",
            "minLength": 1
          },
          "moduleId": {
            "type": "string",
            "minLength": 1
          },
          "operationId": {
            "type": "string",
            "minLength": 1
          },
          "inputBindings": {
            "type": "array",
            "items": {
              "$ref": "#/$defs/artifactBinding"
            }
          },
          "outputBindings": {
            "type": "array",
            "items": {
              "$ref": "#/$defs/artifactBinding"
            }
          },
          "adapterRefs": {
            "type": "array",
            "items": {
              "type": "string",
              "minLength": 1
            }
          },
          "resourceGroupRefs": {
            "type": "array",
            "items": {
              "type": "string",
              "minLength": 1
            }
          }
        },
        "required": [
          "stepId",
          "moduleId",
          "operationId",
          "inputBindings",
          "outputBindings",
          "adapterRefs",
          "resourceGroupRefs"
        ],
        "additionalProperties": true
      },
      "stepBinding": {
        "type": "object",
        "properties": {
          "stepId": {
            "type": "string",
            "minLength": 1
          },
          "moduleId": {
            "type": "string",
            "minLength": 1
          },
          "moduleVersion": {
            "type": "string",
            "minLength": 1
          },
          "nativeBindingRefs": {
            "type": "array",
            "items": {
              "type": "string",
              "minLength": 1
            }
          },
          "artifactRefs": {
            "type": "array",
            "items": {
              "type": "string",
              "minLength": 1
            }
          },
          "modelProfileRefs": {
            "type": "array",
            "items": {
              "type": "string",
              "minLength": 1
            }
          },
          "adapterSelectionRefs": {
            "type": "array",
            "items": {
              "type": "string",
              "minLength": 1
            }
          },
          "localRevisionBindings": {
            "type": "object",
            "additionalProperties": {
              "anyOf": [
                {
                  "type": "string",
                  "minLength": 1
                },
                {
                  "type": "number"
                }
              ]
            }
          }
        },
        "required": [
          "stepId",
          "moduleId",
          "moduleVersion",
          "nativeBindingRefs",
          "artifactRefs",
          "modelProfileRefs",
          "adapterSelectionRefs",
          "localRevisionBindings"
        ],
        "additionalProperties": true
      },
      "check": {
        "type": "object",
        "properties": {
          "criterion": {
            "type": "string",
            "minLength": 1
          },
          "outcome": {
            "enum": [
              "match",
              "mismatch",
              "unknown"
            ]
          },
          "expected": {},
          "observed": {},
          "evidenceRefs": {
            "type": "array",
            "items": {
              "type": "string",
              "minLength": 1
            }
          }
        },
        "required": [
          "criterion",
          "outcome",
          "expected",
          "observed",
          "evidenceRefs"
        ],
        "additionalProperties": true
      },
      "reason": {
        "type": "object",
        "properties": {
          "code": {
            "type": "string",
            "minLength": 1
          },
          "fieldPath": {
            "type": "string"
          },
          "message": {
            "type": "string",
            "minLength": 1
          }
        },
        "required": [
          "code",
          "fieldPath",
          "message"
        ],
        "additionalProperties": true
      },
      "validation": {
        "type": "object",
        "properties": {
          "scope": {
            "type": "string",
            "minLength": 1
          },
          "result": {
            "enum": [
              "pass",
              "fail",
              "not-verified"
            ]
          },
          "evidenceRefs": {
            "type": "array",
            "items": {
              "type": "string",
              "minLength": 1
            }
          }
        },
        "required": [
          "scope",
          "result",
          "evidenceRefs"
        ],
        "additionalProperties": true
      }
    }
  },
  "artifact": {
    "type": "object",
    "properties": {
      "contractVersion": {
        "const": "works-module-contract/1.0-draft.1"
      },
      "artifactId": {
        "type": "string",
        "minLength": 1
      },
      "kind": {
        "type": "string",
        "minLength": 1
      },
      "profileRef": {
        "type": "string",
        "minLength": 1
      },
      "native": {
        "type": "object",
        "properties": {
          "schemaId": {
            "type": "string",
            "minLength": 1
          },
          "schemaVersion": {
            "type": "string",
            "minLength": 1
          },
          "payloadRef": {
            "type": "string",
            "minLength": 1
          },
          "metadata": {
            "type": "object"
          }
        },
        "required": [
          "schemaId",
          "schemaVersion",
          "payloadRef",
          "metadata"
        ],
        "additionalProperties": true
      },
      "semantics": {
        "$ref": "#/$defs/semantics"
      },
      "tensor": {
        "$ref": "#/$defs/tensorArtifact"
      },
      "provenance": {
        "type": "object",
        "properties": {
          "producerRefs": {
            "type": "array",
            "items": {
              "$ref": "#/$defs/identity"
            }
          },
          "consumerBindings": {
            "type": "array",
            "items": {
              "$ref": "#/$defs/identity"
            }
          },
          "transformTraceRefs": {
            "type": "array",
            "items": {
              "type": "string",
              "minLength": 1
            }
          }
        },
        "required": [
          "producerRefs",
          "consumerBindings",
          "transformTraceRefs"
        ],
        "additionalProperties": true
      },
      "lineage": {
        "type": "object",
        "properties": {
          "inputs": {
            "type": "array",
            "items": {
              "type": "string",
              "minLength": 1
            }
          },
          "sourceFrames": {
            "type": "array",
            "items": {
              "type": "object",
              "properties": {
                "inputId": {
                  "type": "string",
                  "minLength": 1
                },
                "slotId": {
                  "type": "string",
                  "minLength": 1
                },
                "indices": {
                  "type": "array",
                  "items": {
                    "type": "integer",
                    "minimum": 0
                  }
                },
                "timesSeconds": {
                  "type": "array",
                  "items": {
                    "type": "number",
                    "minimum": 0
                  }
                }
              },
              "required": [
                "inputId",
                "slotId",
                "indices"
              ],
              "additionalProperties": true
            }
          }
        },
        "required": [
          "inputs",
          "sourceFrames"
        ],
        "additionalProperties": true
      },
      "snapshotId": {
        "anyOf": [
          {
            "type": "string",
            "minLength": 1
          },
          {
            "type": "null"
          }
        ]
      },
      "ownership": {
        "type": "object",
        "properties": {
          "ownerId": {
            "type": "string",
            "minLength": 1
          },
          "mode": {
            "enum": [
              "copy",
              "transfer",
              "borrow",
              "lease"
            ]
          }
        },
        "required": [
          "ownerId",
          "mode"
        ],
        "additionalProperties": true
      },
      "extensions": {
        "$ref": "#/$defs/extensions"
      }
    },
    "required": [
      "contractVersion",
      "artifactId",
      "kind",
      "native",
      "semantics",
      "provenance",
      "lineage",
      "snapshotId",
      "ownership",
      "extensions"
    ],
    "additionalProperties": false,
    "$schema": "https://json-schema.org/draft/2020-12/schema",
    "$id": "urn:kushyameln:works-module-contract:1.0-draft.1:artifact",
    "$defs": {
      "source": {
        "anyOf": [
          {
            "type": "object",
            "properties": {
              "repository": {
                "type": "string",
                "minLength": 1
              },
              "commit": {
                "type": "string",
                "pattern": "^[a-fA-F0-9]{40}$"
              },
              "path": {
                "type": "string",
                "minLength": 1
              }
            },
            "required": [
              "repository",
              "commit",
              "path"
            ],
            "additionalProperties": true
          },
          {
            "type": "object",
            "properties": {
              "archiveRef": {
                "type": "string",
                "minLength": 1
              },
              "sha256": {
                "type": "string",
                "pattern": "^[a-fA-F0-9]{64}$"
              }
            },
            "required": [
              "archiveRef",
              "sha256"
            ],
            "additionalProperties": true
          }
        ]
      },
      "schemaRef": {
        "type": "object",
        "properties": {
          "schemaId": {
            "type": "string",
            "minLength": 1
          },
          "schemaVersion": {
            "type": "string",
            "minLength": 1
          }
        },
        "required": [
          "schemaId",
          "schemaVersion"
        ],
        "additionalProperties": true
      },
      "identity": {
        "type": "object",
        "properties": {
          "identityKind": {
            "type": "string",
            "minLength": 1
          },
          "role": {
            "type": "string",
            "minLength": 1
          },
          "algorithm": {
            "type": "string",
            "minLength": 1
          },
          "value": {
            "type": "string",
            "minLength": 1
          },
          "scope": {
            "type": "string",
            "minLength": 1
          }
        },
        "required": [
          "identityKind",
          "role",
          "algorithm",
          "value",
          "scope"
        ],
        "additionalProperties": true
      },
      "nativeAPI": {
        "type": "object",
        "properties": {
          "version": {
            "type": "string",
            "minLength": 1
          },
          "build": {
            "anyOf": [
              {
                "type": "string",
                "minLength": 1
              },
              {
                "type": "null"
              }
            ]
          },
          "transport": {
            "type": "string",
            "minLength": 1
          },
          "entrypoint": {
            "type": "string",
            "minLength": 1
          }
        },
        "required": [
          "version",
          "build",
          "transport",
          "entrypoint"
        ],
        "additionalProperties": true
      },
      "semantics": {
        "type": "object",
        "properties": {
          "schemaId": {
            "type": "string",
            "minLength": 1
          },
          "schemaVersion": {
            "type": "string",
            "minLength": 1
          },
          "spaceId": {
            "type": "string",
            "minLength": 1
          },
          "unit": {},
          "normalization": {}
        },
        "required": [
          "schemaId",
          "schemaVersion",
          "spaceId"
        ],
        "additionalProperties": true
      },
      "extension": {
        "type": "object",
        "properties": {
          "schemaId": {
            "type": "string",
            "minLength": 1
          },
          "schemaVersion": {
            "type": "string",
            "minLength": 1
          },
          "requiredForUse": {
            "type": "boolean"
          },
          "data": {}
        },
        "required": [
          "schemaId",
          "schemaVersion",
          "requiredForUse",
          "data"
        ],
        "additionalProperties": true
      },
      "extensions": {
        "type": "object",
        "propertyNames": {
          "pattern": "^[^:]+:.+$"
        },
        "additionalProperties": {
          "$ref": "#/$defs/extension"
        }
      },
      "tensorPort": {
        "type": "object",
        "properties": {
          "dtypes": {
            "type": "array",
            "items": {
              "type": "string",
              "minLength": 1
            },
            "minItems": 1
          },
          "axes": {
            "type": "array",
            "items": {
              "type": "string",
              "minLength": 1
            },
            "minItems": 1
          },
          "shape": {
            "type": "array",
            "items": {
              "anyOf": [
                {
                  "type": "integer",
                  "minimum": 1
                },
                {
                  "type": "null"
                }
              ]
            },
            "minItems": 1
          },
          "maxElements": {
            "type": "integer",
            "minimum": 0
          },
          "maxBytes": {
            "type": "integer",
            "minimum": 0
          }
        },
        "required": [
          "dtypes",
          "axes",
          "shape"
        ],
        "additionalProperties": true
      },
      "tensorArtifact": {
        "type": "object",
        "properties": {
          "dtype": {
            "type": "string",
            "minLength": 1
          },
          "shape": {
            "type": "array",
            "items": {
              "type": "integer",
              "minimum": 1
            },
            "minItems": 1
          },
          "axes": {
            "type": "array",
            "items": {
              "type": "string",
              "minLength": 1
            },
            "minItems": 1
          },
          "nativeMeaning": {
            "type": "string",
            "minLength": 1
          },
          "dataRef": {
            "type": "string",
            "minLength": 1
          }
        },
        "required": [
          "dtype",
          "shape",
          "axes",
          "nativeMeaning",
          "dataRef"
        ],
        "additionalProperties": true
      },
      "port": {
        "type": "object",
        "properties": {
          "portId": {
            "type": "string",
            "minLength": 1
          },
          "bindingRef": {
            "type": "string",
            "minLength": 1
          },
          "owner": {
            "type": "string",
            "minLength": 1
          },
          "sourceRef": {
            "$ref": "#/$defs/source"
          },
          "nativeAPI": {
            "$ref": "#/$defs/nativeAPI"
          },
          "artifactKind": {
            "type": "string",
            "minLength": 1
          },
          "semantics": {
            "$ref": "#/$defs/semantics"
          },
          "profileRef": {
            "type": "string",
            "minLength": 1
          },
          "tensor": {
            "$ref": "#/$defs/tensorPort"
          },
          "requiredMetadata": {
            "type": "array",
            "items": {
              "type": "string",
              "pattern": "^(?:/(?:[^~]|~[01])*)*$"
            }
          },
          "requiredIdentities": {
            "type": "array",
            "items": {
              "$ref": "#/$defs/identity"
            }
          },
          "ownershipModes": {
            "type": "array",
            "items": {
              "enum": [
                "copy",
                "transfer",
                "borrow",
                "lease"
              ]
            },
            "minItems": 1
          },
          "transports": {
            "type": "array",
            "items": {
              "type": "string",
              "minLength": 1
            },
            "minItems": 1
          },
          "allowedAdapterRefs": {
            "type": "array",
            "items": {
              "type": "string",
              "minLength": 1
            }
          },
          "requiredExtensionSchemas": {
            "type": "array",
            "items": {
              "$ref": "#/$defs/schemaRef"
            }
          }
        },
        "required": [
          "portId",
          "bindingRef",
          "owner",
          "sourceRef",
          "nativeAPI",
          "artifactKind",
          "semantics",
          "profileRef",
          "requiredMetadata",
          "requiredIdentities",
          "ownershipModes",
          "transports",
          "allowedAdapterRefs",
          "requiredExtensionSchemas"
        ],
        "additionalProperties": true
      },
      "operation": {
        "type": "object",
        "properties": {
          "operationId": {
            "type": "string",
            "minLength": 1
          },
          "roles": {
            "type": "array",
            "items": {
              "type": "string",
              "minLength": 1
            },
            "minItems": 1
          },
          "inputPorts": {
            "type": "array",
            "items": {
              "$ref": "#/$defs/port"
            }
          },
          "outputPorts": {
            "type": "array",
            "items": {
              "$ref": "#/$defs/port"
            }
          },
          "implementationState": {
            "enum": [
              "implemented",
              "partial",
              "not-implemented",
              "unknown"
            ]
          },
          "constraints": {
            "type": "object"
          },
          "profileRefs": {
            "type": "array",
            "items": {
              "type": "string",
              "minLength": 1
            }
          },
          "semanticSchemaRefs": {
            "type": "array",
            "items": {
              "$ref": "#/$defs/schemaRef"
            }
          }
        },
        "required": [
          "operationId",
          "roles",
          "inputPorts",
          "outputPorts",
          "implementationState",
          "constraints",
          "profileRefs",
          "semanticSchemaRefs"
        ],
        "additionalProperties": true
      },
      "artifactBinding": {
        "type": "object",
        "properties": {
          "portId": {
            "type": "string",
            "minLength": 1
          },
          "artifactRef": {
            "type": "string",
            "minLength": 1
          }
        },
        "required": [
          "portId",
          "artifactRef"
        ],
        "additionalProperties": true
      },
      "step": {
        "type": "object",
        "properties": {
          "stepId": {
            "type": "string",
            "minLength": 1
          },
          "moduleId": {
            "type": "string",
            "minLength": 1
          },
          "operationId": {
            "type": "string",
            "minLength": 1
          },
          "inputBindings": {
            "type": "array",
            "items": {
              "$ref": "#/$defs/artifactBinding"
            }
          },
          "outputBindings": {
            "type": "array",
            "items": {
              "$ref": "#/$defs/artifactBinding"
            }
          },
          "adapterRefs": {
            "type": "array",
            "items": {
              "type": "string",
              "minLength": 1
            }
          },
          "resourceGroupRefs": {
            "type": "array",
            "items": {
              "type": "string",
              "minLength": 1
            }
          }
        },
        "required": [
          "stepId",
          "moduleId",
          "operationId",
          "inputBindings",
          "outputBindings",
          "adapterRefs",
          "resourceGroupRefs"
        ],
        "additionalProperties": true
      },
      "stepBinding": {
        "type": "object",
        "properties": {
          "stepId": {
            "type": "string",
            "minLength": 1
          },
          "moduleId": {
            "type": "string",
            "minLength": 1
          },
          "moduleVersion": {
            "type": "string",
            "minLength": 1
          },
          "nativeBindingRefs": {
            "type": "array",
            "items": {
              "type": "string",
              "minLength": 1
            }
          },
          "artifactRefs": {
            "type": "array",
            "items": {
              "type": "string",
              "minLength": 1
            }
          },
          "modelProfileRefs": {
            "type": "array",
            "items": {
              "type": "string",
              "minLength": 1
            }
          },
          "adapterSelectionRefs": {
            "type": "array",
            "items": {
              "type": "string",
              "minLength": 1
            }
          },
          "localRevisionBindings": {
            "type": "object",
            "additionalProperties": {
              "anyOf": [
                {
                  "type": "string",
                  "minLength": 1
                },
                {
                  "type": "number"
                }
              ]
            }
          }
        },
        "required": [
          "stepId",
          "moduleId",
          "moduleVersion",
          "nativeBindingRefs",
          "artifactRefs",
          "modelProfileRefs",
          "adapterSelectionRefs",
          "localRevisionBindings"
        ],
        "additionalProperties": true
      },
      "check": {
        "type": "object",
        "properties": {
          "criterion": {
            "type": "string",
            "minLength": 1
          },
          "outcome": {
            "enum": [
              "match",
              "mismatch",
              "unknown"
            ]
          },
          "expected": {},
          "observed": {},
          "evidenceRefs": {
            "type": "array",
            "items": {
              "type": "string",
              "minLength": 1
            }
          }
        },
        "required": [
          "criterion",
          "outcome",
          "expected",
          "observed",
          "evidenceRefs"
        ],
        "additionalProperties": true
      },
      "reason": {
        "type": "object",
        "properties": {
          "code": {
            "type": "string",
            "minLength": 1
          },
          "fieldPath": {
            "type": "string"
          },
          "message": {
            "type": "string",
            "minLength": 1
          }
        },
        "required": [
          "code",
          "fieldPath",
          "message"
        ],
        "additionalProperties": true
      },
      "validation": {
        "type": "object",
        "properties": {
          "scope": {
            "type": "string",
            "minLength": 1
          },
          "result": {
            "enum": [
              "pass",
              "fail",
              "not-verified"
            ]
          },
          "evidenceRefs": {
            "type": "array",
            "items": {
              "type": "string",
              "minLength": 1
            }
          }
        },
        "required": [
          "scope",
          "result",
          "evidenceRefs"
        ],
        "additionalProperties": true
      }
    }
  },
  "pipeline-profile": {
    "type": "object",
    "properties": {
      "contractVersion": {
        "const": "works-module-contract/1.0-draft.1"
      },
      "profileId": {
        "type": "string",
        "minLength": 1
      },
      "profileVersion": {
        "type": "string",
        "minLength": 1
      },
      "semanticProfileRefs": {
        "type": "array",
        "items": {
          "type": "string",
          "minLength": 1
        }
      },
      "externalArtifactRefs": {
        "type": "array",
        "items": {
          "type": "string",
          "minLength": 1
        }
      },
      "steps": {
        "type": "array",
        "items": {
          "$ref": "#/$defs/step"
        },
        "minItems": 1
      },
      "requiredEvidenceScopes": {
        "type": "array",
        "items": {
          "type": "string",
          "minLength": 1
        }
      }
    },
    "required": [
      "contractVersion",
      "profileId",
      "profileVersion",
      "semanticProfileRefs",
      "externalArtifactRefs",
      "steps",
      "requiredEvidenceScopes"
    ],
    "additionalProperties": true,
    "$schema": "https://json-schema.org/draft/2020-12/schema",
    "$id": "urn:kushyameln:works-module-contract:1.0-draft.1:pipeline-profile",
    "$defs": {
      "source": {
        "anyOf": [
          {
            "type": "object",
            "properties": {
              "repository": {
                "type": "string",
                "minLength": 1
              },
              "commit": {
                "type": "string",
                "pattern": "^[a-fA-F0-9]{40}$"
              },
              "path": {
                "type": "string",
                "minLength": 1
              }
            },
            "required": [
              "repository",
              "commit",
              "path"
            ],
            "additionalProperties": true
          },
          {
            "type": "object",
            "properties": {
              "archiveRef": {
                "type": "string",
                "minLength": 1
              },
              "sha256": {
                "type": "string",
                "pattern": "^[a-fA-F0-9]{64}$"
              }
            },
            "required": [
              "archiveRef",
              "sha256"
            ],
            "additionalProperties": true
          }
        ]
      },
      "schemaRef": {
        "type": "object",
        "properties": {
          "schemaId": {
            "type": "string",
            "minLength": 1
          },
          "schemaVersion": {
            "type": "string",
            "minLength": 1
          }
        },
        "required": [
          "schemaId",
          "schemaVersion"
        ],
        "additionalProperties": true
      },
      "identity": {
        "type": "object",
        "properties": {
          "identityKind": {
            "type": "string",
            "minLength": 1
          },
          "role": {
            "type": "string",
            "minLength": 1
          },
          "algorithm": {
            "type": "string",
            "minLength": 1
          },
          "value": {
            "type": "string",
            "minLength": 1
          },
          "scope": {
            "type": "string",
            "minLength": 1
          }
        },
        "required": [
          "identityKind",
          "role",
          "algorithm",
          "value",
          "scope"
        ],
        "additionalProperties": true
      },
      "nativeAPI": {
        "type": "object",
        "properties": {
          "version": {
            "type": "string",
            "minLength": 1
          },
          "build": {
            "anyOf": [
              {
                "type": "string",
                "minLength": 1
              },
              {
                "type": "null"
              }
            ]
          },
          "transport": {
            "type": "string",
            "minLength": 1
          },
          "entrypoint": {
            "type": "string",
            "minLength": 1
          }
        },
        "required": [
          "version",
          "build",
          "transport",
          "entrypoint"
        ],
        "additionalProperties": true
      },
      "semantics": {
        "type": "object",
        "properties": {
          "schemaId": {
            "type": "string",
            "minLength": 1
          },
          "schemaVersion": {
            "type": "string",
            "minLength": 1
          },
          "spaceId": {
            "type": "string",
            "minLength": 1
          },
          "unit": {},
          "normalization": {}
        },
        "required": [
          "schemaId",
          "schemaVersion",
          "spaceId"
        ],
        "additionalProperties": true
      },
      "extension": {
        "type": "object",
        "properties": {
          "schemaId": {
            "type": "string",
            "minLength": 1
          },
          "schemaVersion": {
            "type": "string",
            "minLength": 1
          },
          "requiredForUse": {
            "type": "boolean"
          },
          "data": {}
        },
        "required": [
          "schemaId",
          "schemaVersion",
          "requiredForUse",
          "data"
        ],
        "additionalProperties": true
      },
      "extensions": {
        "type": "object",
        "propertyNames": {
          "pattern": "^[^:]+:.+$"
        },
        "additionalProperties": {
          "$ref": "#/$defs/extension"
        }
      },
      "tensorPort": {
        "type": "object",
        "properties": {
          "dtypes": {
            "type": "array",
            "items": {
              "type": "string",
              "minLength": 1
            },
            "minItems": 1
          },
          "axes": {
            "type": "array",
            "items": {
              "type": "string",
              "minLength": 1
            },
            "minItems": 1
          },
          "shape": {
            "type": "array",
            "items": {
              "anyOf": [
                {
                  "type": "integer",
                  "minimum": 1
                },
                {
                  "type": "null"
                }
              ]
            },
            "minItems": 1
          },
          "maxElements": {
            "type": "integer",
            "minimum": 0
          },
          "maxBytes": {
            "type": "integer",
            "minimum": 0
          }
        },
        "required": [
          "dtypes",
          "axes",
          "shape"
        ],
        "additionalProperties": true
      },
      "tensorArtifact": {
        "type": "object",
        "properties": {
          "dtype": {
            "type": "string",
            "minLength": 1
          },
          "shape": {
            "type": "array",
            "items": {
              "type": "integer",
              "minimum": 1
            },
            "minItems": 1
          },
          "axes": {
            "type": "array",
            "items": {
              "type": "string",
              "minLength": 1
            },
            "minItems": 1
          },
          "nativeMeaning": {
            "type": "string",
            "minLength": 1
          },
          "dataRef": {
            "type": "string",
            "minLength": 1
          }
        },
        "required": [
          "dtype",
          "shape",
          "axes",
          "nativeMeaning",
          "dataRef"
        ],
        "additionalProperties": true
      },
      "port": {
        "type": "object",
        "properties": {
          "portId": {
            "type": "string",
            "minLength": 1
          },
          "bindingRef": {
            "type": "string",
            "minLength": 1
          },
          "owner": {
            "type": "string",
            "minLength": 1
          },
          "sourceRef": {
            "$ref": "#/$defs/source"
          },
          "nativeAPI": {
            "$ref": "#/$defs/nativeAPI"
          },
          "artifactKind": {
            "type": "string",
            "minLength": 1
          },
          "semantics": {
            "$ref": "#/$defs/semantics"
          },
          "profileRef": {
            "type": "string",
            "minLength": 1
          },
          "tensor": {
            "$ref": "#/$defs/tensorPort"
          },
          "requiredMetadata": {
            "type": "array",
            "items": {
              "type": "string",
              "pattern": "^(?:/(?:[^~]|~[01])*)*$"
            }
          },
          "requiredIdentities": {
            "type": "array",
            "items": {
              "$ref": "#/$defs/identity"
            }
          },
          "ownershipModes": {
            "type": "array",
            "items": {
              "enum": [
                "copy",
                "transfer",
                "borrow",
                "lease"
              ]
            },
            "minItems": 1
          },
          "transports": {
            "type": "array",
            "items": {
              "type": "string",
              "minLength": 1
            },
            "minItems": 1
          },
          "allowedAdapterRefs": {
            "type": "array",
            "items": {
              "type": "string",
              "minLength": 1
            }
          },
          "requiredExtensionSchemas": {
            "type": "array",
            "items": {
              "$ref": "#/$defs/schemaRef"
            }
          }
        },
        "required": [
          "portId",
          "bindingRef",
          "owner",
          "sourceRef",
          "nativeAPI",
          "artifactKind",
          "semantics",
          "profileRef",
          "requiredMetadata",
          "requiredIdentities",
          "ownershipModes",
          "transports",
          "allowedAdapterRefs",
          "requiredExtensionSchemas"
        ],
        "additionalProperties": true
      },
      "operation": {
        "type": "object",
        "properties": {
          "operationId": {
            "type": "string",
            "minLength": 1
          },
          "roles": {
            "type": "array",
            "items": {
              "type": "string",
              "minLength": 1
            },
            "minItems": 1
          },
          "inputPorts": {
            "type": "array",
            "items": {
              "$ref": "#/$defs/port"
            }
          },
          "outputPorts": {
            "type": "array",
            "items": {
              "$ref": "#/$defs/port"
            }
          },
          "implementationState": {
            "enum": [
              "implemented",
              "partial",
              "not-implemented",
              "unknown"
            ]
          },
          "constraints": {
            "type": "object"
          },
          "profileRefs": {
            "type": "array",
            "items": {
              "type": "string",
              "minLength": 1
            }
          },
          "semanticSchemaRefs": {
            "type": "array",
            "items": {
              "$ref": "#/$defs/schemaRef"
            }
          }
        },
        "required": [
          "operationId",
          "roles",
          "inputPorts",
          "outputPorts",
          "implementationState",
          "constraints",
          "profileRefs",
          "semanticSchemaRefs"
        ],
        "additionalProperties": true
      },
      "artifactBinding": {
        "type": "object",
        "properties": {
          "portId": {
            "type": "string",
            "minLength": 1
          },
          "artifactRef": {
            "type": "string",
            "minLength": 1
          }
        },
        "required": [
          "portId",
          "artifactRef"
        ],
        "additionalProperties": true
      },
      "step": {
        "type": "object",
        "properties": {
          "stepId": {
            "type": "string",
            "minLength": 1
          },
          "moduleId": {
            "type": "string",
            "minLength": 1
          },
          "operationId": {
            "type": "string",
            "minLength": 1
          },
          "inputBindings": {
            "type": "array",
            "items": {
              "$ref": "#/$defs/artifactBinding"
            }
          },
          "outputBindings": {
            "type": "array",
            "items": {
              "$ref": "#/$defs/artifactBinding"
            }
          },
          "adapterRefs": {
            "type": "array",
            "items": {
              "type": "string",
              "minLength": 1
            }
          },
          "resourceGroupRefs": {
            "type": "array",
            "items": {
              "type": "string",
              "minLength": 1
            }
          }
        },
        "required": [
          "stepId",
          "moduleId",
          "operationId",
          "inputBindings",
          "outputBindings",
          "adapterRefs",
          "resourceGroupRefs"
        ],
        "additionalProperties": true
      },
      "stepBinding": {
        "type": "object",
        "properties": {
          "stepId": {
            "type": "string",
            "minLength": 1
          },
          "moduleId": {
            "type": "string",
            "minLength": 1
          },
          "moduleVersion": {
            "type": "string",
            "minLength": 1
          },
          "nativeBindingRefs": {
            "type": "array",
            "items": {
              "type": "string",
              "minLength": 1
            }
          },
          "artifactRefs": {
            "type": "array",
            "items": {
              "type": "string",
              "minLength": 1
            }
          },
          "modelProfileRefs": {
            "type": "array",
            "items": {
              "type": "string",
              "minLength": 1
            }
          },
          "adapterSelectionRefs": {
            "type": "array",
            "items": {
              "type": "string",
              "minLength": 1
            }
          },
          "localRevisionBindings": {
            "type": "object",
            "additionalProperties": {
              "anyOf": [
                {
                  "type": "string",
                  "minLength": 1
                },
                {
                  "type": "number"
                }
              ]
            }
          }
        },
        "required": [
          "stepId",
          "moduleId",
          "moduleVersion",
          "nativeBindingRefs",
          "artifactRefs",
          "modelProfileRefs",
          "adapterSelectionRefs",
          "localRevisionBindings"
        ],
        "additionalProperties": true
      },
      "check": {
        "type": "object",
        "properties": {
          "criterion": {
            "type": "string",
            "minLength": 1
          },
          "outcome": {
            "enum": [
              "match",
              "mismatch",
              "unknown"
            ]
          },
          "expected": {},
          "observed": {},
          "evidenceRefs": {
            "type": "array",
            "items": {
              "type": "string",
              "minLength": 1
            }
          }
        },
        "required": [
          "criterion",
          "outcome",
          "expected",
          "observed",
          "evidenceRefs"
        ],
        "additionalProperties": true
      },
      "reason": {
        "type": "object",
        "properties": {
          "code": {
            "type": "string",
            "minLength": 1
          },
          "fieldPath": {
            "type": "string"
          },
          "message": {
            "type": "string",
            "minLength": 1
          }
        },
        "required": [
          "code",
          "fieldPath",
          "message"
        ],
        "additionalProperties": true
      },
      "validation": {
        "type": "object",
        "properties": {
          "scope": {
            "type": "string",
            "minLength": 1
          },
          "result": {
            "enum": [
              "pass",
              "fail",
              "not-verified"
            ]
          },
          "evidenceRefs": {
            "type": "array",
            "items": {
              "type": "string",
              "minLength": 1
            }
          }
        },
        "required": [
          "scope",
          "result",
          "evidenceRefs"
        ],
        "additionalProperties": true
      }
    }
  },
  "execution-snapshot": {
    "type": "object",
    "properties": {
      "contractVersion": {
        "const": "works-module-contract/1.0-draft.1"
      },
      "snapshotId": {
        "type": "string",
        "minLength": 1
      },
      "snapshotHash": {
        "type": "string",
        "minLength": 1
      },
      "managerSessionId": {
        "type": "string",
        "minLength": 1
      },
      "managerRevision": {
        "type": "integer",
        "minimum": 0
      },
      "pipelineProfileRef": {
        "type": "string",
        "minLength": 1
      },
      "stepBindings": {
        "type": "array",
        "items": {
          "$ref": "#/$defs/stepBinding"
        }
      },
      "artifactManifestRef": {
        "type": "string",
        "minLength": 1
      },
      "evidenceManifestRef": {
        "type": "string",
        "minLength": 1
      }
    },
    "required": [
      "contractVersion",
      "snapshotId",
      "snapshotHash",
      "managerSessionId",
      "managerRevision",
      "pipelineProfileRef",
      "stepBindings",
      "artifactManifestRef",
      "evidenceManifestRef"
    ],
    "additionalProperties": true,
    "$schema": "https://json-schema.org/draft/2020-12/schema",
    "$id": "urn:kushyameln:works-module-contract:1.0-draft.1:execution-snapshot",
    "$defs": {
      "source": {
        "anyOf": [
          {
            "type": "object",
            "properties": {
              "repository": {
                "type": "string",
                "minLength": 1
              },
              "commit": {
                "type": "string",
                "pattern": "^[a-fA-F0-9]{40}$"
              },
              "path": {
                "type": "string",
                "minLength": 1
              }
            },
            "required": [
              "repository",
              "commit",
              "path"
            ],
            "additionalProperties": true
          },
          {
            "type": "object",
            "properties": {
              "archiveRef": {
                "type": "string",
                "minLength": 1
              },
              "sha256": {
                "type": "string",
                "pattern": "^[a-fA-F0-9]{64}$"
              }
            },
            "required": [
              "archiveRef",
              "sha256"
            ],
            "additionalProperties": true
          }
        ]
      },
      "schemaRef": {
        "type": "object",
        "properties": {
          "schemaId": {
            "type": "string",
            "minLength": 1
          },
          "schemaVersion": {
            "type": "string",
            "minLength": 1
          }
        },
        "required": [
          "schemaId",
          "schemaVersion"
        ],
        "additionalProperties": true
      },
      "identity": {
        "type": "object",
        "properties": {
          "identityKind": {
            "type": "string",
            "minLength": 1
          },
          "role": {
            "type": "string",
            "minLength": 1
          },
          "algorithm": {
            "type": "string",
            "minLength": 1
          },
          "value": {
            "type": "string",
            "minLength": 1
          },
          "scope": {
            "type": "string",
            "minLength": 1
          }
        },
        "required": [
          "identityKind",
          "role",
          "algorithm",
          "value",
          "scope"
        ],
        "additionalProperties": true
      },
      "nativeAPI": {
        "type": "object",
        "properties": {
          "version": {
            "type": "string",
            "minLength": 1
          },
          "build": {
            "anyOf": [
              {
                "type": "string",
                "minLength": 1
              },
              {
                "type": "null"
              }
            ]
          },
          "transport": {
            "type": "string",
            "minLength": 1
          },
          "entrypoint": {
            "type": "string",
            "minLength": 1
          }
        },
        "required": [
          "version",
          "build",
          "transport",
          "entrypoint"
        ],
        "additionalProperties": true
      },
      "semantics": {
        "type": "object",
        "properties": {
          "schemaId": {
            "type": "string",
            "minLength": 1
          },
          "schemaVersion": {
            "type": "string",
            "minLength": 1
          },
          "spaceId": {
            "type": "string",
            "minLength": 1
          },
          "unit": {},
          "normalization": {}
        },
        "required": [
          "schemaId",
          "schemaVersion",
          "spaceId"
        ],
        "additionalProperties": true
      },
      "extension": {
        "type": "object",
        "properties": {
          "schemaId": {
            "type": "string",
            "minLength": 1
          },
          "schemaVersion": {
            "type": "string",
            "minLength": 1
          },
          "requiredForUse": {
            "type": "boolean"
          },
          "data": {}
        },
        "required": [
          "schemaId",
          "schemaVersion",
          "requiredForUse",
          "data"
        ],
        "additionalProperties": true
      },
      "extensions": {
        "type": "object",
        "propertyNames": {
          "pattern": "^[^:]+:.+$"
        },
        "additionalProperties": {
          "$ref": "#/$defs/extension"
        }
      },
      "tensorPort": {
        "type": "object",
        "properties": {
          "dtypes": {
            "type": "array",
            "items": {
              "type": "string",
              "minLength": 1
            },
            "minItems": 1
          },
          "axes": {
            "type": "array",
            "items": {
              "type": "string",
              "minLength": 1
            },
            "minItems": 1
          },
          "shape": {
            "type": "array",
            "items": {
              "anyOf": [
                {
                  "type": "integer",
                  "minimum": 1
                },
                {
                  "type": "null"
                }
              ]
            },
            "minItems": 1
          },
          "maxElements": {
            "type": "integer",
            "minimum": 0
          },
          "maxBytes": {
            "type": "integer",
            "minimum": 0
          }
        },
        "required": [
          "dtypes",
          "axes",
          "shape"
        ],
        "additionalProperties": true
      },
      "tensorArtifact": {
        "type": "object",
        "properties": {
          "dtype": {
            "type": "string",
            "minLength": 1
          },
          "shape": {
            "type": "array",
            "items": {
              "type": "integer",
              "minimum": 1
            },
            "minItems": 1
          },
          "axes": {
            "type": "array",
            "items": {
              "type": "string",
              "minLength": 1
            },
            "minItems": 1
          },
          "nativeMeaning": {
            "type": "string",
            "minLength": 1
          },
          "dataRef": {
            "type": "string",
            "minLength": 1
          }
        },
        "required": [
          "dtype",
          "shape",
          "axes",
          "nativeMeaning",
          "dataRef"
        ],
        "additionalProperties": true
      },
      "port": {
        "type": "object",
        "properties": {
          "portId": {
            "type": "string",
            "minLength": 1
          },
          "bindingRef": {
            "type": "string",
            "minLength": 1
          },
          "owner": {
            "type": "string",
            "minLength": 1
          },
          "sourceRef": {
            "$ref": "#/$defs/source"
          },
          "nativeAPI": {
            "$ref": "#/$defs/nativeAPI"
          },
          "artifactKind": {
            "type": "string",
            "minLength": 1
          },
          "semantics": {
            "$ref": "#/$defs/semantics"
          },
          "profileRef": {
            "type": "string",
            "minLength": 1
          },
          "tensor": {
            "$ref": "#/$defs/tensorPort"
          },
          "requiredMetadata": {
            "type": "array",
            "items": {
              "type": "string",
              "pattern": "^(?:/(?:[^~]|~[01])*)*$"
            }
          },
          "requiredIdentities": {
            "type": "array",
            "items": {
              "$ref": "#/$defs/identity"
            }
          },
          "ownershipModes": {
            "type": "array",
            "items": {
              "enum": [
                "copy",
                "transfer",
                "borrow",
                "lease"
              ]
            },
            "minItems": 1
          },
          "transports": {
            "type": "array",
            "items": {
              "type": "string",
              "minLength": 1
            },
            "minItems": 1
          },
          "allowedAdapterRefs": {
            "type": "array",
            "items": {
              "type": "string",
              "minLength": 1
            }
          },
          "requiredExtensionSchemas": {
            "type": "array",
            "items": {
              "$ref": "#/$defs/schemaRef"
            }
          }
        },
        "required": [
          "portId",
          "bindingRef",
          "owner",
          "sourceRef",
          "nativeAPI",
          "artifactKind",
          "semantics",
          "profileRef",
          "requiredMetadata",
          "requiredIdentities",
          "ownershipModes",
          "transports",
          "allowedAdapterRefs",
          "requiredExtensionSchemas"
        ],
        "additionalProperties": true
      },
      "operation": {
        "type": "object",
        "properties": {
          "operationId": {
            "type": "string",
            "minLength": 1
          },
          "roles": {
            "type": "array",
            "items": {
              "type": "string",
              "minLength": 1
            },
            "minItems": 1
          },
          "inputPorts": {
            "type": "array",
            "items": {
              "$ref": "#/$defs/port"
            }
          },
          "outputPorts": {
            "type": "array",
            "items": {
              "$ref": "#/$defs/port"
            }
          },
          "implementationState": {
            "enum": [
              "implemented",
              "partial",
              "not-implemented",
              "unknown"
            ]
          },
          "constraints": {
            "type": "object"
          },
          "profileRefs": {
            "type": "array",
            "items": {
              "type": "string",
              "minLength": 1
            }
          },
          "semanticSchemaRefs": {
            "type": "array",
            "items": {
              "$ref": "#/$defs/schemaRef"
            }
          }
        },
        "required": [
          "operationId",
          "roles",
          "inputPorts",
          "outputPorts",
          "implementationState",
          "constraints",
          "profileRefs",
          "semanticSchemaRefs"
        ],
        "additionalProperties": true
      },
      "artifactBinding": {
        "type": "object",
        "properties": {
          "portId": {
            "type": "string",
            "minLength": 1
          },
          "artifactRef": {
            "type": "string",
            "minLength": 1
          }
        },
        "required": [
          "portId",
          "artifactRef"
        ],
        "additionalProperties": true
      },
      "step": {
        "type": "object",
        "properties": {
          "stepId": {
            "type": "string",
            "minLength": 1
          },
          "moduleId": {
            "type": "string",
            "minLength": 1
          },
          "operationId": {
            "type": "string",
            "minLength": 1
          },
          "inputBindings": {
            "type": "array",
            "items": {
              "$ref": "#/$defs/artifactBinding"
            }
          },
          "outputBindings": {
            "type": "array",
            "items": {
              "$ref": "#/$defs/artifactBinding"
            }
          },
          "adapterRefs": {
            "type": "array",
            "items": {
              "type": "string",
              "minLength": 1
            }
          },
          "resourceGroupRefs": {
            "type": "array",
            "items": {
              "type": "string",
              "minLength": 1
            }
          }
        },
        "required": [
          "stepId",
          "moduleId",
          "operationId",
          "inputBindings",
          "outputBindings",
          "adapterRefs",
          "resourceGroupRefs"
        ],
        "additionalProperties": true
      },
      "stepBinding": {
        "type": "object",
        "properties": {
          "stepId": {
            "type": "string",
            "minLength": 1
          },
          "moduleId": {
            "type": "string",
            "minLength": 1
          },
          "moduleVersion": {
            "type": "string",
            "minLength": 1
          },
          "nativeBindingRefs": {
            "type": "array",
            "items": {
              "type": "string",
              "minLength": 1
            }
          },
          "artifactRefs": {
            "type": "array",
            "items": {
              "type": "string",
              "minLength": 1
            }
          },
          "modelProfileRefs": {
            "type": "array",
            "items": {
              "type": "string",
              "minLength": 1
            }
          },
          "adapterSelectionRefs": {
            "type": "array",
            "items": {
              "type": "string",
              "minLength": 1
            }
          },
          "localRevisionBindings": {
            "type": "object",
            "additionalProperties": {
              "anyOf": [
                {
                  "type": "string",
                  "minLength": 1
                },
                {
                  "type": "number"
                }
              ]
            }
          }
        },
        "required": [
          "stepId",
          "moduleId",
          "moduleVersion",
          "nativeBindingRefs",
          "artifactRefs",
          "modelProfileRefs",
          "adapterSelectionRefs",
          "localRevisionBindings"
        ],
        "additionalProperties": true
      },
      "check": {
        "type": "object",
        "properties": {
          "criterion": {
            "type": "string",
            "minLength": 1
          },
          "outcome": {
            "enum": [
              "match",
              "mismatch",
              "unknown"
            ]
          },
          "expected": {},
          "observed": {},
          "evidenceRefs": {
            "type": "array",
            "items": {
              "type": "string",
              "minLength": 1
            }
          }
        },
        "required": [
          "criterion",
          "outcome",
          "expected",
          "observed",
          "evidenceRefs"
        ],
        "additionalProperties": true
      },
      "reason": {
        "type": "object",
        "properties": {
          "code": {
            "type": "string",
            "minLength": 1
          },
          "fieldPath": {
            "type": "string"
          },
          "message": {
            "type": "string",
            "minLength": 1
          }
        },
        "required": [
          "code",
          "fieldPath",
          "message"
        ],
        "additionalProperties": true
      },
      "validation": {
        "type": "object",
        "properties": {
          "scope": {
            "type": "string",
            "minLength": 1
          },
          "result": {
            "enum": [
              "pass",
              "fail",
              "not-verified"
            ]
          },
          "evidenceRefs": {
            "type": "array",
            "items": {
              "type": "string",
              "minLength": 1
            }
          }
        },
        "required": [
          "scope",
          "result",
          "evidenceRefs"
        ],
        "additionalProperties": true
      }
    }
  },
  "edge-decision": {
    "type": "object",
    "properties": {
      "contractVersion": {
        "const": "works-module-contract/1.0-draft.1"
      },
      "decisionId": {
        "type": "string",
        "minLength": 1
      },
      "producerBindingRef": {
        "type": "string",
        "minLength": 1
      },
      "consumerBindingRef": {
        "type": "string",
        "minLength": 1
      },
      "contractRefs": {
        "type": "array",
        "items": {
          "type": "string",
          "minLength": 1
        }
      },
      "adapterRefs": {
        "type": "array",
        "items": {
          "type": "string",
          "minLength": 1
        }
      },
      "compatibility": {
        "enum": [
          "COMPATIBLE",
          "NEEDS_ADAPTER",
          "INCOMPATIBLE",
          "UNVERIFIED"
        ]
      },
      "checks": {
        "type": "array",
        "items": {
          "$ref": "#/$defs/check"
        }
      },
      "reasons": {
        "type": "array",
        "items": {
          "$ref": "#/$defs/reason"
        }
      },
      "validation": {
        "type": "array",
        "items": {
          "$ref": "#/$defs/validation"
        }
      },
      "readiness": {
        "type": "object",
        "properties": {
          "state": {
            "enum": [
              "ready",
              "blocked",
              "failed"
            ]
          },
          "reasons": {
            "type": "array",
            "items": {
              "type": "string",
              "minLength": 1
            }
          }
        },
        "required": [
          "state",
          "reasons"
        ],
        "additionalProperties": true
      },
      "unresolvedRefs": {
        "type": "array",
        "items": {
          "type": "string",
          "minLength": 1
        }
      }
    },
    "required": [
      "contractVersion",
      "decisionId",
      "producerBindingRef",
      "consumerBindingRef",
      "contractRefs",
      "adapterRefs",
      "compatibility",
      "checks",
      "reasons",
      "validation",
      "readiness",
      "unresolvedRefs"
    ],
    "additionalProperties": true,
    "$schema": "https://json-schema.org/draft/2020-12/schema",
    "$id": "urn:kushyameln:works-module-contract:1.0-draft.1:edge-decision",
    "$defs": {
      "source": {
        "anyOf": [
          {
            "type": "object",
            "properties": {
              "repository": {
                "type": "string",
                "minLength": 1
              },
              "commit": {
                "type": "string",
                "pattern": "^[a-fA-F0-9]{40}$"
              },
              "path": {
                "type": "string",
                "minLength": 1
              }
            },
            "required": [
              "repository",
              "commit",
              "path"
            ],
            "additionalProperties": true
          },
          {
            "type": "object",
            "properties": {
              "archiveRef": {
                "type": "string",
                "minLength": 1
              },
              "sha256": {
                "type": "string",
                "pattern": "^[a-fA-F0-9]{64}$"
              }
            },
            "required": [
              "archiveRef",
              "sha256"
            ],
            "additionalProperties": true
          }
        ]
      },
      "schemaRef": {
        "type": "object",
        "properties": {
          "schemaId": {
            "type": "string",
            "minLength": 1
          },
          "schemaVersion": {
            "type": "string",
            "minLength": 1
          }
        },
        "required": [
          "schemaId",
          "schemaVersion"
        ],
        "additionalProperties": true
      },
      "identity": {
        "type": "object",
        "properties": {
          "identityKind": {
            "type": "string",
            "minLength": 1
          },
          "role": {
            "type": "string",
            "minLength": 1
          },
          "algorithm": {
            "type": "string",
            "minLength": 1
          },
          "value": {
            "type": "string",
            "minLength": 1
          },
          "scope": {
            "type": "string",
            "minLength": 1
          }
        },
        "required": [
          "identityKind",
          "role",
          "algorithm",
          "value",
          "scope"
        ],
        "additionalProperties": true
      },
      "nativeAPI": {
        "type": "object",
        "properties": {
          "version": {
            "type": "string",
            "minLength": 1
          },
          "build": {
            "anyOf": [
              {
                "type": "string",
                "minLength": 1
              },
              {
                "type": "null"
              }
            ]
          },
          "transport": {
            "type": "string",
            "minLength": 1
          },
          "entrypoint": {
            "type": "string",
            "minLength": 1
          }
        },
        "required": [
          "version",
          "build",
          "transport",
          "entrypoint"
        ],
        "additionalProperties": true
      },
      "semantics": {
        "type": "object",
        "properties": {
          "schemaId": {
            "type": "string",
            "minLength": 1
          },
          "schemaVersion": {
            "type": "string",
            "minLength": 1
          },
          "spaceId": {
            "type": "string",
            "minLength": 1
          },
          "unit": {},
          "normalization": {}
        },
        "required": [
          "schemaId",
          "schemaVersion",
          "spaceId"
        ],
        "additionalProperties": true
      },
      "extension": {
        "type": "object",
        "properties": {
          "schemaId": {
            "type": "string",
            "minLength": 1
          },
          "schemaVersion": {
            "type": "string",
            "minLength": 1
          },
          "requiredForUse": {
            "type": "boolean"
          },
          "data": {}
        },
        "required": [
          "schemaId",
          "schemaVersion",
          "requiredForUse",
          "data"
        ],
        "additionalProperties": true
      },
      "extensions": {
        "type": "object",
        "propertyNames": {
          "pattern": "^[^:]+:.+$"
        },
        "additionalProperties": {
          "$ref": "#/$defs/extension"
        }
      },
      "tensorPort": {
        "type": "object",
        "properties": {
          "dtypes": {
            "type": "array",
            "items": {
              "type": "string",
              "minLength": 1
            },
            "minItems": 1
          },
          "axes": {
            "type": "array",
            "items": {
              "type": "string",
              "minLength": 1
            },
            "minItems": 1
          },
          "shape": {
            "type": "array",
            "items": {
              "anyOf": [
                {
                  "type": "integer",
                  "minimum": 1
                },
                {
                  "type": "null"
                }
              ]
            },
            "minItems": 1
          },
          "maxElements": {
            "type": "integer",
            "minimum": 0
          },
          "maxBytes": {
            "type": "integer",
            "minimum": 0
          }
        },
        "required": [
          "dtypes",
          "axes",
          "shape"
        ],
        "additionalProperties": true
      },
      "tensorArtifact": {
        "type": "object",
        "properties": {
          "dtype": {
            "type": "string",
            "minLength": 1
          },
          "shape": {
            "type": "array",
            "items": {
              "type": "integer",
              "minimum": 1
            },
            "minItems": 1
          },
          "axes": {
            "type": "array",
            "items": {
              "type": "string",
              "minLength": 1
            },
            "minItems": 1
          },
          "nativeMeaning": {
            "type": "string",
            "minLength": 1
          },
          "dataRef": {
            "type": "string",
            "minLength": 1
          }
        },
        "required": [
          "dtype",
          "shape",
          "axes",
          "nativeMeaning",
          "dataRef"
        ],
        "additionalProperties": true
      },
      "port": {
        "type": "object",
        "properties": {
          "portId": {
            "type": "string",
            "minLength": 1
          },
          "bindingRef": {
            "type": "string",
            "minLength": 1
          },
          "owner": {
            "type": "string",
            "minLength": 1
          },
          "sourceRef": {
            "$ref": "#/$defs/source"
          },
          "nativeAPI": {
            "$ref": "#/$defs/nativeAPI"
          },
          "artifactKind": {
            "type": "string",
            "minLength": 1
          },
          "semantics": {
            "$ref": "#/$defs/semantics"
          },
          "profileRef": {
            "type": "string",
            "minLength": 1
          },
          "tensor": {
            "$ref": "#/$defs/tensorPort"
          },
          "requiredMetadata": {
            "type": "array",
            "items": {
              "type": "string",
              "pattern": "^(?:/(?:[^~]|~[01])*)*$"
            }
          },
          "requiredIdentities": {
            "type": "array",
            "items": {
              "$ref": "#/$defs/identity"
            }
          },
          "ownershipModes": {
            "type": "array",
            "items": {
              "enum": [
                "copy",
                "transfer",
                "borrow",
                "lease"
              ]
            },
            "minItems": 1
          },
          "transports": {
            "type": "array",
            "items": {
              "type": "string",
              "minLength": 1
            },
            "minItems": 1
          },
          "allowedAdapterRefs": {
            "type": "array",
            "items": {
              "type": "string",
              "minLength": 1
            }
          },
          "requiredExtensionSchemas": {
            "type": "array",
            "items": {
              "$ref": "#/$defs/schemaRef"
            }
          }
        },
        "required": [
          "portId",
          "bindingRef",
          "owner",
          "sourceRef",
          "nativeAPI",
          "artifactKind",
          "semantics",
          "profileRef",
          "requiredMetadata",
          "requiredIdentities",
          "ownershipModes",
          "transports",
          "allowedAdapterRefs",
          "requiredExtensionSchemas"
        ],
        "additionalProperties": true
      },
      "operation": {
        "type": "object",
        "properties": {
          "operationId": {
            "type": "string",
            "minLength": 1
          },
          "roles": {
            "type": "array",
            "items": {
              "type": "string",
              "minLength": 1
            },
            "minItems": 1
          },
          "inputPorts": {
            "type": "array",
            "items": {
              "$ref": "#/$defs/port"
            }
          },
          "outputPorts": {
            "type": "array",
            "items": {
              "$ref": "#/$defs/port"
            }
          },
          "implementationState": {
            "enum": [
              "implemented",
              "partial",
              "not-implemented",
              "unknown"
            ]
          },
          "constraints": {
            "type": "object"
          },
          "profileRefs": {
            "type": "array",
            "items": {
              "type": "string",
              "minLength": 1
            }
          },
          "semanticSchemaRefs": {
            "type": "array",
            "items": {
              "$ref": "#/$defs/schemaRef"
            }
          }
        },
        "required": [
          "operationId",
          "roles",
          "inputPorts",
          "outputPorts",
          "implementationState",
          "constraints",
          "profileRefs",
          "semanticSchemaRefs"
        ],
        "additionalProperties": true
      },
      "artifactBinding": {
        "type": "object",
        "properties": {
          "portId": {
            "type": "string",
            "minLength": 1
          },
          "artifactRef": {
            "type": "string",
            "minLength": 1
          }
        },
        "required": [
          "portId",
          "artifactRef"
        ],
        "additionalProperties": true
      },
      "step": {
        "type": "object",
        "properties": {
          "stepId": {
            "type": "string",
            "minLength": 1
          },
          "moduleId": {
            "type": "string",
            "minLength": 1
          },
          "operationId": {
            "type": "string",
            "minLength": 1
          },
          "inputBindings": {
            "type": "array",
            "items": {
              "$ref": "#/$defs/artifactBinding"
            }
          },
          "outputBindings": {
            "type": "array",
            "items": {
              "$ref": "#/$defs/artifactBinding"
            }
          },
          "adapterRefs": {
            "type": "array",
            "items": {
              "type": "string",
              "minLength": 1
            }
          },
          "resourceGroupRefs": {
            "type": "array",
            "items": {
              "type": "string",
              "minLength": 1
            }
          }
        },
        "required": [
          "stepId",
          "moduleId",
          "operationId",
          "inputBindings",
          "outputBindings",
          "adapterRefs",
          "resourceGroupRefs"
        ],
        "additionalProperties": true
      },
      "stepBinding": {
        "type": "object",
        "properties": {
          "stepId": {
            "type": "string",
            "minLength": 1
          },
          "moduleId": {
            "type": "string",
            "minLength": 1
          },
          "moduleVersion": {
            "type": "string",
            "minLength": 1
          },
          "nativeBindingRefs": {
            "type": "array",
            "items": {
              "type": "string",
              "minLength": 1
            }
          },
          "artifactRefs": {
            "type": "array",
            "items": {
              "type": "string",
              "minLength": 1
            }
          },
          "modelProfileRefs": {
            "type": "array",
            "items": {
              "type": "string",
              "minLength": 1
            }
          },
          "adapterSelectionRefs": {
            "type": "array",
            "items": {
              "type": "string",
              "minLength": 1
            }
          },
          "localRevisionBindings": {
            "type": "object",
            "additionalProperties": {
              "anyOf": [
                {
                  "type": "string",
                  "minLength": 1
                },
                {
                  "type": "number"
                }
              ]
            }
          }
        },
        "required": [
          "stepId",
          "moduleId",
          "moduleVersion",
          "nativeBindingRefs",
          "artifactRefs",
          "modelProfileRefs",
          "adapterSelectionRefs",
          "localRevisionBindings"
        ],
        "additionalProperties": true
      },
      "check": {
        "type": "object",
        "properties": {
          "criterion": {
            "type": "string",
            "minLength": 1
          },
          "outcome": {
            "enum": [
              "match",
              "mismatch",
              "unknown"
            ]
          },
          "expected": {},
          "observed": {},
          "evidenceRefs": {
            "type": "array",
            "items": {
              "type": "string",
              "minLength": 1
            }
          }
        },
        "required": [
          "criterion",
          "outcome",
          "expected",
          "observed",
          "evidenceRefs"
        ],
        "additionalProperties": true
      },
      "reason": {
        "type": "object",
        "properties": {
          "code": {
            "type": "string",
            "minLength": 1
          },
          "fieldPath": {
            "type": "string"
          },
          "message": {
            "type": "string",
            "minLength": 1
          }
        },
        "required": [
          "code",
          "fieldPath",
          "message"
        ],
        "additionalProperties": true
      },
      "validation": {
        "type": "object",
        "properties": {
          "scope": {
            "type": "string",
            "minLength": 1
          },
          "result": {
            "enum": [
              "pass",
              "fail",
              "not-verified"
            ]
          },
          "evidenceRefs": {
            "type": "array",
            "items": {
              "type": "string",
              "minLength": 1
            }
          }
        },
        "required": [
          "scope",
          "result",
          "evidenceRefs"
        ],
        "additionalProperties": true
      }
    }
  }
};
