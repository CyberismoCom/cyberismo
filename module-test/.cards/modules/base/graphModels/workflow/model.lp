graph(toplevelGraph).
attr(graph, toplevelGraph, rankdir, "TD").

% the "initial node" from where the card is created
node("", toplevelGraph) :- workflowState(Workflow, State, _), visible(Workflow).

% Let's add a separate "Any state" for every state that has transitions from "*"
node(("*", To), toplevelGraph) :-
    workflowTransition(Workflow, _, "*", To),
    visible(Workflow).

attr(node, ("*", To), label, @concatenate("<<font point-size='24'> Any state </font>>")) :-
    workflowTransition(Workflow, _, "*", To),
    visible(Workflow).

node(State, toplevelGraph) :- workflowState(Workflow, State, _), visible(Workflow).

attr(node, State, label, @concatenate("<<font point-size='32'> <b>", State, "</b> </font> <br/> <font point-size='19'>", StateCategory, "</font>>")) :-
    workflowState(Workflow, State, StateCategory),
    visible(Workflow),
    State != "",
    State != "*".

edge((From, To, Transition), toplevelGraph) :-
    workflowTransition(Workflow, Transition, From, To),
    visible(Workflow),
    From != "*".

attr(edge, (From, To, Transition), label, @concatenate("<<font point-size='24'>", Transition, "</font>>")) :-
    workflowTransition(Workflow, Transition, From, To),
    visible(Workflow),
    From != "*".

edge((("*", To), To, Transition), toplevelGraph) :-
    workflowTransition(Workflow, Transition, "*", To),
    visible(Workflow).

attr(edge, (("*", To), To, Transition), label, @concatenate("<<font point-size='24'>", Transition, "</font>>")) :-
    workflowTransition(Workflow, Transition, "*", To),
    visible(Workflow).

% margins
attr(graph, toplevelGraph, pad, "0.2").
attr(graph, toplevelGraph, nodesep, "2").
attr(graph, toplevelGraph, ranksep, "3").
attr(node, X, margin, "0.4") :- node(X, _).
attr(graph, X, margin, "25") :- graph(X, _).

% penwidth
attr(graph, X, penwidth, "3") :- graph(X).
attr(graph, X, penwidth, "3") :- graph(X, _).
attr(node, X, penwidth, "3") :- node(X, _), X != "".
attr(node, X, penwidth, "6") :- node(X, _), X = "".
attr(edge, (X, Y, N), pendwidth, "3") :- edge((X, Y, N), _).
attr(edge, (X, Y, N), arrowsize, "2") :- edge((X, Y, N), _).

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

#show graph /1.
#show graph /2.
#show node /2.
#show edge /2.
#show attr /4.
