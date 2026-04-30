graph(toplevelGraph).
attr(graph, toplevelGraph, rankdir, "TD").

% the "initial node" from where the card is created
node("", toplevelGraph) :- workflowState(Workflow, State, _), visible(Workflow).

% Let's add a separate "Any state" for every state that has transitions from "*"
node(("*", To), toplevelGraph) :-
    workflowTransition(Workflow, _, "*", To),
    visible(Workflow).

attr(node, ("*", To), label, @concatenate("<<font point-size='11'> Any state </font>>")) :-
    workflowTransition(Workflow, _, "*", To),
    visible(Workflow).

node(State, toplevelGraph) :- workflowState(Workflow, State, _), visible(Workflow).

% Regular state label
attr(node, State, label, @concatenate("<<font point-size='14'> <b>", State, "</b> </font> <br/> <font point-size='10'>", StateCategory, "</font>>")) :-
    workflowState(Workflow, State, StateCategory),
    visible(Workflow),
    not currentState(State),
    State != "",
    State != "*".

% Current state label is rendered larger and underlined to stand out
attr(node, State, label, @concatenate("<<font point-size='16'> <b><u>", State, "</u></b> </font> <br/> <font point-size='10'>", StateCategory, "</font>>")) :-
    workflowState(Workflow, State, StateCategory),
    visible(Workflow),
    currentState(State),
    State != "",
    State != "*".

edge((From, To, Transition), toplevelGraph) :-
    workflowTransition(Workflow, Transition, From, To),
    visible(Workflow),
    From != "*".

attr(edge, (From, To, Transition), label, @concatenate("<<font point-size='10'>", Transition, "</font>>")) :-
    workflowTransition(Workflow, Transition, From, To),
    visible(Workflow),
    From != "*".

edge((("*", To), To, Transition), toplevelGraph) :-
    workflowTransition(Workflow, Transition, "*", To),
    visible(Workflow).

attr(edge, (("*", To), To, Transition), label, @concatenate("<<font point-size='10'>", Transition, "</font>>")) :-
    workflowTransition(Workflow, Transition, "*", To),
    visible(Workflow).

% margins
attr(graph, toplevelGraph, pad, "0.1").
attr(graph, toplevelGraph, nodesep, "0.6").
attr(graph, toplevelGraph, ranksep, "0.7").
attr(node, X, margin, "0.15") :- node(X, _).
attr(graph, X, margin, "8") :- graph(X, _).

% penwidth
attr(graph, X, penwidth, "1") :- graph(X).
attr(graph, X, penwidth, "1") :- graph(X, _).
attr(node, X, penwidth, "1") :- node(X, _), X != "", not currentState(X).
attr(node, X, penwidth, "3") :- node(X, _), currentState(X).
attr(node, X, penwidth, "2") :- node(X, _), X = "".
attr(edge, (X, Y, N), penwidth, "1") :- edge((X, Y, N), _).
attr(edge, (X, Y, N), arrowsize, "0.8") :- edge((X, Y, N), _).

% shapes of nodes
attr(node, X, shape, rectangle) :- node(X, _), X != "".
attr(node, X, shape, circle) :- node(X, _), X = "".
attr(node, X, style, rounded) :- node(X, _).

% node colours
attr(node, State, color, "#FF9300") :-
    workflowState(Workflow, State, "active"),
    visible(Workflow).

attr(node, State, color, "#37E900") :-
    workflowState(Workflow, State, "closed"),
    visible(Workflow).

% fonts
attr(graph, G, fontname, "helvetica") :- graph(G).
attr(graph, G, fontname, "helvetica") :- graph(G, _).
attr(node, N, fontname, "helvetica") :- node(N, _).
attr(edge, (X, Y, N), fontname, "helvetica") :- edge((X, Y, N), _).
