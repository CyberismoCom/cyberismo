% model
% note: not escapted
{{{model}}}

% include the view:
{{{view}}}

selectAll.

result(result).

% We need to format the label attributes without double quotes,
% because labels already use HTML < and >, but we'll enclose other
% attributes in double quotes, so here is a helper term to identify label attributes:
labelAttribute("label").
labelAttribute(label).

% top-level graph
childResult(result, Graph, "digraphs") :-
    graph(Graph).

childResult(Graph, ((graph, Graph), Field), "attrs") :-
    graph(Graph),
    attr(graph, Graph, Field, _).

field(((graph, Graph), Field), "attr", Field) :-
    graph(Graph),
    attr(graph, Graph, Field, _).

field(((graph, Graph), Field), "value", Value) :-
    graph(Graph),
    attr(graph, Graph, Field, Value),
    labelAttribute(Field).

field(((graph, Graph), Field), "value", @concatenate("\"", Value, "\"")) :-
    graph(Graph),
    attr(graph, Graph, Field, Value),
    not labelAttribute(Field).

% subgraphs
childResult(Parent, Graph, "children") :-
    graph(Graph, Parent).

field(Graph, "isGraph", "void") :-
    childResult(_, Graph, "children"),
    graph(Graph, _).

childResult(Graph, ((graph, Graph), Field), "attrs") :-
    graph(Graph, _),
    attr(graph, Graph, Field, _).

field(((graph, Graph), Field), "attr", Field) :-
    graph(Graph, _),
    attr(graph, Graph, Field, _).

field(((graph, Graph), Field), "value", Value) :-
    graph(Graph, _),
    attr(graph, Graph, Field, Value),
    labelAttribute(Field).

field(((graph, Graph), Field), "value", @concatenate("\"", Value, "\"")) :-
    graph(Graph, _),
    attr(graph, Graph, Field, Value),
    not labelAttribute(Field).

% nodes

% TODO: For some reason, we need to use (node, Node) instead of Node, or
% the solving will not succeed

field((node, Node), "rank", Rank) :- field(Node, "rank", Rank), node(Node, _).

field((node, Node), "isNode", "void") :-
    childResult(_, (node, Node), "children"),
    node(Node, _).

childResult(Graph, (node, Node), "children") :-
    childResult(_, Graph, _),
    node(Node, Graph).

field((node, Node), "cardKey", Node) :-
    childResult(_, Graph, _),
    node(Node, Graph).

childResult((node, Node), ((node, Node), Field), "attrs") :-
    node(Node, Graph),
    attr(node, Node, Field, _).

field(((node, Node), Field), "attr", Field) :-
    node(Node, Graph),
    attr(node, Node, Field, _).

field(((node, Node), Field), "value", Value) :-
    node(Node, Graph),
    attr(node, Node, Field, Value),
    labelAttribute(Field).

field(((node, Node), Field), "value", @concatenate("\"", Value, "\"")) :-
    node(Node, Graph),
    attr(node, Node, Field, Value),
    not labelAttribute(Field).

% edges
childResult(Graph, (edge, (XR, YR, Description)), "edges") :-
    childResult(_, Graph, _),
    edge((XR, YR, Description), Graph).

childResult((edge, (XR, YR, Description)), ((edge, (XR, YR, Description)), Field), "attrs") :-
    childResult(_, (edge, (XR, YR, Description)), _),
    attr(edge, (XR, YR, Description), Field, _).

field(((edge, (XR, YR, Description)), Field), "attr", Field) :-
    childResult(_, (edge, (XR, YR, Description)), _),
    attr(edge, (XR, YR, Description), Field, Value).

field(((edge, (XR, YR, Description)), Field), "value", Value) :-
    childResult(_, (edge, (XR, YR, Description)), _),
    attr(edge, (XR, YR, Description), Field, Value).

field((edge, (XR, YR, Description)), "source", XR) :-
    edge((XR, YR, Description), _).

field((edge, (XR, YR, Description)), "destination", YR) :-
    edge((XR, YR, Description), _).

order(N, Collection, 1, "rank", "ASC") :- resultLevel(_, N, Collection).