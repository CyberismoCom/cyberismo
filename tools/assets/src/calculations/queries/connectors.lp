% Connectors
result(Name) :- connector(Name).
resultField(Name, "type", "connector", "shortText") :- connector(Name).
resultField(Name, "displayName", Value, "shortText") :- connector(Name), field(Name, "displayName", Value).

% External items
result((Connector, Key)) :- externalItem((Connector, Key)).
resultField((Connector, Key), "type", "item", "shortText") :- externalItem((Connector, Key)).
resultField((Connector, Key), "connector", Connector, "shortText") :- externalItem((Connector, Key)).
resultField((Connector, Key), "itemKey", Key, "shortText") :- externalItem((Connector, Key)).
resultField((Connector, Key), "title", Value, "shortText") :- externalItem((Connector, Key)), field((Connector, Key), "title", Value).
