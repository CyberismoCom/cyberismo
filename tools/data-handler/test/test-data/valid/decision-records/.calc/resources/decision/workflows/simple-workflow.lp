workflowState("decision/workflows/simple-workflow", "Created", "initial").
workflowState("decision/workflows/simple-workflow", "Approved", "closed").
workflowState("decision/workflows/simple-workflow", "Deprecated", "closed").
workflowTransition("decision/workflows/simple-workflow", "Create", "", "Created").
workflowTransition("decision/workflows/simple-workflow", "Approve", "Created", "Approved").
workflowTransition("decision/workflows/simple-workflow", "Deprecate", "Approved", "Deprecated").
workflowTransition("decision/workflows/simple-workflow", "Deprecate", "Create", "Deprecated").
