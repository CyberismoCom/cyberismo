workflowState("decision/workflows/decision-workflow", "Draft", "initial").
workflowState("decision/workflows/decision-workflow", "Approved", "closed").
workflowState("decision/workflows/decision-workflow", "Rejected", "closed").
workflowState("decision/workflows/decision-workflow", "Rerejected", "closed").
workflowState("decision/workflows/decision-workflow", "Deprecated", "closed").
workflowTransition("decision/workflows/decision-workflow", "Create", "", "Draft").
workflowTransition("decision/workflows/decision-workflow", "Approve", "Draft", "Approved").
workflowTransition("decision/workflows/decision-workflow", "Reject", "Draft", "Rejected").
workflowTransition("decision/workflows/decision-workflow", "Reject", "Approved", "Rejected").
workflowTransition("decision/workflows/decision-workflow", "Reject", "Rejected", "Rejected").
workflowTransition("decision/workflows/decision-workflow", "Rereject", "Rejected", "Rejected").
workflowTransition("decision/workflows/decision-workflow", "Reopen", "*", "Draft").
workflowTransition("decision/workflows/decision-workflow", "Deprecate", "Approved", "Deprecated").
