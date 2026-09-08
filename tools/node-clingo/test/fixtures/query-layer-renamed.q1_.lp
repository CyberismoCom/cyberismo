#program base.
% Cyberismo query language
% select(n, collection, field): on result level n and for "collection", "field" should be returned
% selectCollectionField(collection, field): on all result levels for "collection", "field" should be returned
% selectCollection(n, collection, name): on result level n and for "collection", a child collection called "name" should be produced (the collection analogue of select(n, collection, field) — a collection is requested by name, not smuggled in as a pretend field)
% selectAll(n): on result level n, all fields should be returned for all collections
% select(field): "field" should be returned on all levels of hierarchy for all collections
% selectAll: all fields should be returned on all levels of hierarchy for all collections
q1_select(N,Collection,Field) :- select(Field); q1_resultLevel(_,N,Collection).
q1_selectAll(N) :- selectAll; q1_resultLevel(_,N,_).
q1_select(N,Collection,Field) :- selectCollectionField(Collection,Field); q1_resultLevel(_,N,Collection).
% the default child result collection is "results"
q1_childResult(Key,Child,"results") :- childResult(Key,Child).
% resultLevel(key, n, collection): result "key" is on result level n in "collection"
q1_resultLevel(Key,1,"results") :- result(Key).
q1_resultLevel(Child,(N+1),Collection) :- q1_childResult(Key,Child,Collection); q1_resultLevel(Key,N,_).
q1_resultLevel(Child,(N+1),Collection) :- q1_childObject(Key,Child,Collection); q1_resultLevel(Key,N,_).
% result(key): key is a result of the query
#show q1_result(Key) : result(Key); not q1_queryError.
% childResult(key, child key): child key is a child result of key
#show q1_childResult(Key,Child,Collection) : q1_childResult(Key,Child,Collection); not q1_queryError.
% childObject(key, child, collection): childObject is similar to childResult, expect it is an object
#show q1_childObject(Key,Child,Collection) : q1_childObject(Key,Child,Collection); not q1_queryError.
% helpers for simplifying some of the #show statements
% anyResult(key): key is included in the results as a result or a child result/object
q1_anyResult(Key) :- result(Key).
q1_anyResult(Key) :- q1_childResult(_,Key,_).
q1_anyResult(Key) :- q1_childObject(_,Key,_).
% showAll(key): whether all fields or field-like things of a key should be included in the results
q1_showAll(Key) :- q1_anyResult(Key); q1_resultLevel(Key,Level,_); q1_selectAll(Level); not q1_queryError.
% showField: whether a certain field or field-like thing of a key should be included in the results
q1_showField(Key,Field) :- q1_anyResult(Key); q1_resultLevel(Key,Level,_); select(Level,Field); not q1_queryError.
q1_showField(Key,Field) :- q1_anyResult(Key); q1_resultLevel(Key,Level,Collection); q1_select(Level,Collection,Field); not q1_queryError.
% showField is also defined if showAll is defined so there is only a single show predicate for each result
q1_showField(Key,Field) :- q1_showAll(Key); field(Key,Field,_).
% showCollection(key, name): whether a collection called "name" should be produced under "key" (the collection analogue of showField)
q1_showCollection(Key,Name) :- q1_anyResult(Key); q1_resultLevel(Key,Level,Collection); selectCollection(Level,Collection,Name); not q1_queryError.
% Allow specifying up to 3 fields at the same time for showField, similar to field
% For specifying 2 fields
q1_resultField(Key,Field,Value,DataType) :- q1_resultFields(Key,Field,Value,DataType,_,_,_).
q1_resultField(Key,Field,Value,DataType) :- q1_resultFields(Key,_,_,_,Field,Value,DataType).
% For specifying 3 fields
q1_resultField(Key,Field,Value,DataType) :- q1_resultFields(Key,Field,Value,DataType,_,_,_,_,_,_).
q1_resultField(Key,Field,Value,DataType) :- q1_resultFields(Key,_,_,_,Field,Value,DataType,_,_,_).
q1_resultField(Key,Field,Value,DataType) :- q1_resultFields(Key,_,_,_,_,_,_,Field,Value,DataType).
%
% field(key, field, value, data type):
% "field" of result/child result "key" has value "value",
% data type of the field is included, if not specified, it is shortText
% a field term like this is returned for all other fields except enum and list
#show q1_field(Key,Field,Value,DataType) : field(Key,Field,Value); field(Field,"dataType",DataType); DataType != "enum"; DataType != "list"; q1_showField(Key,Field).
#show q1_field(Key,Field,Value,DataType) : DataType != "enum"; DataType != "list"; q1_resultField(Key,Field,Value,DataType).
#show q1_field(Key,Field,Value,"shortText") : field(Key,Field,Value); not field(Field,"dataType",_); q1_showField(Key,Field).
% list
q1_listField(Key,Field,Value) :- q1_resultField(Key,Field,Value,"list").
q1_listField(Key,Field,Value) :- field(Key,Field,Value); field(Field,"dataType","list"); q1_showField(Key,Field).
q1_childResult(Key,(Key,Field,Value),Field) :- q1_listField(Key,Field,Value).
q1_resultField((Key,Field,Value),"value",Value,"shortText") :- q1_listField(Key,Field,Value).
q1_resultField((Key,Field,Value),"index",Index,"integer") :- q1_listField(Key,Field,Value); field((Field,Value),"index",Index).
q1_resultField((Key,Field,Value),"displayName",EnumDisplayValue,"shortText") :- q1_listField(Key,Field,Value); field((Field,Value),"enumDisplayValue",EnumDisplayValue).
% enum
q1_enumField(Key,Field,Value) :- q1_resultField(Key,Field,Value,"enum").
q1_enumField(Key,Field,Value) :- field(Key,Field,Value); field(Field,"dataType","enum"); q1_showField(Key,Field).
q1_childObject(Key,(Key,Field),Field) :- q1_enumField(Key,Field,_).
q1_resultField((Key,Field),"value",Value,"shortText") :- q1_enumField(Key,Field,Value).
q1_resultField((Key,Field),"index",Index,"integer") :- q1_enumField(Key,Field,Value); field((Field,Value),"index",Index).
q1_resultField((Key,Field),"displayValue",EnumDisplayValue,"shortText") :- q1_enumField(Key,Field,Value); field((Field,Value),"enumDisplayValue",EnumDisplayValue).
% allow using field directly
% fields are always shown
% childResultCollection(ParentKey, Collection): Defines a childResult. Allows guaranteeing an empty list, if no elements are present
#show q1_childResultCollection(ParentKey,Collection) : q1_childResultCollection(ParentKey,Collection).
% order(n, collection, 1, field, direction): the results in the collection on level n should be first ordered by "field" in "direction"
% order(n, collection, 2, field, direction): the results in the collection on level n should be secondly ordered by "field" in "direction"
% etc.
% direction must be "ASC" or "DESC".
% orderBy is syntactic sugar for order, as you can order by 1..3 fields with one term when using the default collection "results"
% orderBy with an even numer of parameters refers to results on all levels of hierarchy.
q1_order(N,"results",1,Field,Direction) :- orderBy(Field,Direction); q1_resultLevel(_,N,"results").
q1_order(N,"results",1,Field1,Direction1) :- orderBy(Field1,Direction1,_,_); q1_resultLevel(_,N,"results").
q1_order(N,"results",2,Field2,Direction2) :- orderBy(_,_,Field2,Direction2); q1_resultLevel(_,N,"results").
q1_order(N,"results",1,Field1,Direction1) :- orderBy(Field1,Direction1,_,_,_,_); q1_resultLevel(_,N,"results").
q1_order(N,"results",2,Field2,Direction2) :- orderBy(_,_,Field2,Direction2,_,_); q1_resultLevel(_,N,"results").
q1_order(N,"results",3,Field3,Direction3) :- orderBy(_,_,_,_,Field3,Direction3); q1_resultLevel(_,N,"results").
% orderBy with an odd numer of parameters has the result level as the first parameter
q1_order(Level,"results",1,Field,Direction) :- orderBy(Level,Field,Direction).
q1_order(Level,"results",1,Field1,Direction1) :- orderBy(Level,Field1,Direction1,_,_).
q1_order(Level,"results",2,Field2,Direction2) :- orderBy(Level,_,_,Field2,Direction2).
q1_order(Level,"results",1,Field1,Direction1) :- orderBy(Level,Field1,Direction1,_,_,_,_).
q1_order(Level,"results",2,Field2,Direction2) :- orderBy(Level,_,_,Field2,Direction2,_,_).
q1_order(Level,"results",3,Field3,Direction3) :- orderBy(Level,_,_,_,_,Field3,Direction3).
% select the fields that are needed for sorting automatically
q1_select(Level,Collection,Field) :- q1_order(Level,Collection,_,Field,_).
q1_queryError("Invalid direction in ordering:",(Level,Collection,Index,Field,Direction)) :- q1_order(Level,Collection,Index,Field,Direction); Direction != "ASC"; Direction != "DESC".
q1_queryError("Ordering direction missing:",Field) :- orderBy(Field).
q1_queryError("Conflicting ordering for fields: ",(Field1,Field2)) :- q1_order(Level,Collection,Index,Field1,_); q1_order(Level,Collection,Index,Field2,_); Field1 != Field2.
q1_queryError("Conflicting ordering direction",(Field,Collection,Direction1,Direction2)) :- q1_order(Level,Collection,Index,Field,Direction1); q1_order(Level,Collection,Index,Field,Direction2); Direction1 != Direction2.
q1_queryError :- q1_queryError(_,_).
#show q1_order(Level,Collection,Index,Field,Direction) : q1_order(Level,Collection,Index,Field,Direction); not q1_queryError.
#show q1_queryError/2.
% helper terms
q1_level(Level) :- q1_resultLevel(_,Level,_).
% Utils extends the cyberismo query language
% policy checks
q1_childObject(Card,(Card,"policyChecks"),"policyChecks") :- q1_showCollection(Card,"policyChecks").
q1_childResultCollection((Card,"policyChecks"),"successes") :- q1_childObject(Card,(Card,"policyChecks"),"policyChecks").
q1_childResultCollection((Card,"policyChecks"),"failures") :- q1_childObject(Card,(Card,"policyChecks"),"policyChecks").
% successes
q1_childResult((Card,"policyChecks"),(Card,Category,Title),"successes") :- q1_childObject(Card,(Card,"policyChecks"),"policyChecks"); policyCheckSuccess(Card,Category,Title).
q1_resultFields((Card,Category,Title),"category",Category,"shortText","title",Title,"shortText") :- q1_childObject(Card,(Card,"policyChecks"),"policyChecks"); policyCheckSuccess(Card,Category,Title).
% failures
q1_childResult((Card,"policyChecks"),(Card,Category,Title,ErrorMessage,Field),"failures") :- q1_childObject(Card,(Card,"policyChecks"),"policyChecks"); policyCheckFailure(Card,Category,Title,ErrorMessage,Field).
q1_resultFields((Card,Category,Title,ErrorMessage,Field),"category",Category,"shortText","title",Title,"shortText","errorMessage",ErrorMessage,"shortText") :- q1_childObject(Card,(Card,"policyChecks"),"policyChecks"); policyCheckFailure(Card,Category,Title,ErrorMessage,Field).
q1_resultField((Card,Category,Title,ErrorMessage,Field),"fieldName",Field,"shortText") :- q1_childObject(Card,(Card,"policyChecks"),"policyChecks"); Field != ""; policyCheckFailure(Card,Category,Title,ErrorMessage,Field).
% links
q1_childResultCollection(Card,"links") :- q1_showCollection(Card,"links").
q1_childResult(Card,(Card,Destination,LinkType,"","outbound"),"links") :- link(Card,Destination,LinkType); q1_showCollection(Card,"links").
q1_childResult(Card,(Card,Destination,LinkType,LinkDescription,"outbound"),"links") :- link(Card,Destination,LinkType,LinkDescription); q1_showCollection(Card,"links").
q1_childResult(Card,(Source,Card,LinkType,"","inbound"),"links") :- link(Source,Card,LinkType); q1_showCollection(Card,"links").
q1_childResult(Card,(Source,Card,LinkType,LinkDescription,"inbound"),"links") :- link(Source,Card,LinkType,LinkDescription); q1_showCollection(Card,"links").
% links: displayName
q1_resultField((Source,Destination,LinkType,LinkDescription,Direction),"displayName",DisplayName,"shortText") :- q1_childResult(_,(Source,Destination,LinkType,LinkDescription,Direction),"links"); Direction = "outbound"; field(LinkType,"outboundDisplayName",DisplayName).
q1_resultField((Source,Destination,LinkType,LinkDescription,Direction),"displayName",DisplayName,"shortText") :- q1_childResult(_,(Source,Destination,LinkType,LinkDescription,Direction),"links"); Direction = "inbound"; field(LinkType,"inboundDisplayName",DisplayName).
% links: link description
q1_resultField((Source,Destination,LinkType,LinkDescription,Direction),"linkDescription",LinkDescription,"shortText") :- LinkDescription != ""; q1_childResult(_,(Source,Destination,LinkType,LinkDescription,Direction),"links").
% links: direction and link type
q1_resultFields((Source,Destination,LinkType,LinkDescription,Direction),"direction",Direction,"shortText","linkType",LinkType,"shortText") :- q1_childResult(_,(Source,Destination,LinkType,LinkDescription,Direction),"links").
% links: link source
q1_resultField((Source,Destination,LinkType,LinkDescription,Direction),"linkSource","user","shortText") :- q1_childResult(_,(Source,Destination,LinkType,LinkDescription,Direction),"links"); userLink(Source,Destination,LinkType).
q1_resultField((Source,Destination,LinkType,LinkDescription,Direction),"linkSource","user","shortText") :- q1_childResult(_,(Source,Destination,LinkType,LinkDescription,Direction),"links"); userLink(Source,Destination,LinkType,LinkDescription).
q1_resultField((Source,Destination,LinkType,LinkDescription,Direction),"linkSource","calculated","shortText") :- q1_childResult(_,(Source,Destination,LinkType,LinkDescription,Direction),"links"); calculatedLink(Source,Destination,LinkType).
q1_resultField((Source,Destination,LinkType,LinkDescription,Direction),"linkSource","calculated","shortText") :- q1_childResult(_,(Source,Destination,LinkType,LinkDescription,Direction),"links"); calculatedLink(Source,Destination,LinkType,LinkDescription).
% links: title - for card destinations
q1_resultField((Card,Destination,LinkType,LinkDescription,Direction),"title",Title,"shortText") :- q1_childResult(Card,(Card,Destination,LinkType,LinkDescription,Direction),"links"); field(Destination,"title",Title); card(Destination).
% links: title - for external item destinations (from externalItem facts)
q1_resultField((Card,(Connector,ItemKey),LinkType,LinkDescription,Direction),"title",Title,"shortText") :- q1_childResult(Card,(Card,(Connector,ItemKey),LinkType,LinkDescription,Direction),"links"); field((Connector,ItemKey),"title",Title).
% links: title - for external item destinations (fallback to key if no title fact)
q1_resultField((Card,(Connector,ItemKey),LinkType,LinkDescription,Direction),"title",ItemKey,"shortText") :- q1_childResult(Card,(Card,(Connector,ItemKey),LinkType,LinkDescription,Direction),"links"); not field((Connector,ItemKey),"title",_).
% links: title - for card sources (inbound)
q1_resultField((Source,Card,LinkType,LinkDescription,Direction),"title",Title,"shortText") :- q1_childResult(Card,(Source,Card,LinkType,LinkDescription,Direction),"links"); field(Source,"title",Title); card(Source).
% links: title - for external item sources (inbound, from externalItem facts)
q1_resultField(((Connector,ItemKey),Card,LinkType,LinkDescription,Direction),"title",Title,"shortText") :- q1_childResult(Card,((Connector,ItemKey),Card,LinkType,LinkDescription,Direction),"links"); field((Connector,ItemKey),"title",Title).
% links: title - for external item sources (inbound, fallback to key if no title fact)
q1_resultField(((Connector,ItemKey),Card,LinkType,LinkDescription,Direction),"title",ItemKey,"shortText") :- q1_childResult(Card,((Connector,ItemKey),Card,LinkType,LinkDescription,Direction),"links"); not field((Connector,ItemKey),"title",_).
% links: key - for card destinations
q1_resultField((Card,Destination,LinkType,LinkDescription,Direction),"key",Destination,"shortText") :- q1_childResult(Card,(Card,Destination,LinkType,LinkDescription,Direction),"links"); card(Destination).
% links: key - for external item destinations
q1_resultField((Card,(Connector,ItemKey),LinkType,LinkDescription,Direction),"key",ItemKey,"shortText") :- q1_childResult(Card,(Card,(Connector,ItemKey),LinkType,LinkDescription,Direction),"links").
% links: key - for card sources (inbound)
q1_resultField((Source,Card,LinkType,LinkDescription,Direction),"key",Source,"shortText") :- q1_childResult(Card,(Source,Card,LinkType,LinkDescription,Direction),"links"); card(Source).
% links: key - for external item sources (inbound)
q1_resultField(((Connector,ItemKey),Card,LinkType,LinkDescription,Direction),"key",ItemKey,"shortText") :- q1_childResult(Card,((Connector,ItemKey),Card,LinkType,LinkDescription,Direction),"links").
% links: connector - for external item destinations
q1_resultField((Card,(Connector,ItemKey),LinkType,LinkDescription,Direction),"connector",Connector,"shortText") :- q1_childResult(Card,(Card,(Connector,ItemKey),LinkType,LinkDescription,Direction),"links").
% links: connector - for external item sources (inbound)
q1_resultField(((Connector,ItemKey),Card,LinkType,LinkDescription,Direction),"connector",Connector,"shortText") :- q1_childResult(Card,((Connector,ItemKey),Card,LinkType,LinkDescription,Direction),"links").
% links: url - for external item destinations (only if url fact exists)
q1_resultField((Card,(Connector,ItemKey),LinkType,LinkDescription,Direction),"url",Url,"shortText") :- q1_childResult(Card,(Card,(Connector,ItemKey),LinkType,LinkDescription,Direction),"links"); field((Connector,ItemKey),"url",Url).
% links: url - for external item sources (inbound, only if url fact exists)
q1_resultField(((Connector,ItemKey),Card,LinkType,LinkDescription,Direction),"url",Url,"shortText") :- q1_childResult(Card,((Connector,ItemKey),Card,LinkType,LinkDescription,Direction),"links"); field((Connector,ItemKey),"url",Url).
% notifications
q1_childResultCollection(Card,"notifications") :- q1_showCollection(Card,"notifications").
% notifications
q1_childResult(Card,(Card,Category,Title,Message),"notifications") :- q1_showCollection(Card,"notifications"); notification(Card,Category,Title,Message).
q1_resultFields((Card,Category,Title,Message),"key",Card,"shortText","category",Category,"shortText","title",Title,"shortText") :- q1_childResult(Card,(Card,Category,Title,Message),"notifications").
q1_resultField((Card,Category,Title,Message),"message",Message,"shortText") :- q1_childResult(Card,(Card,Category,Title,Message),"notifications").
% denied operations
q1_childObject(Card,(Card,"deniedOperations"),"deniedOperations") :- q1_showCollection(Card,"deniedOperations").
% transition denied operations
q1_childResultCollection((Card,"deniedOperations"),"transition") :- q1_childObject(Card,(Card,"deniedOperations"),"deniedOperations").
q1_childResult((Card,"deniedOperations"),(Card,TransitionName,ErrorMessage),"transition") :- q1_childObject(Card,(Card,"deniedOperations"),"deniedOperations"); transitionDenied(Card,TransitionName,ErrorMessage).
q1_resultFields((Card,TransitionName,ErrorMessage),"transitionName",TransitionName,"shortText","errorMessage",ErrorMessage,"shortText") :- q1_childResult((Card,"deniedOperations"),(Card,TransitionName,ErrorMessage),"transition").
% move denied operations
q1_childResultCollection((Card,"deniedOperations"),"move") :- q1_childObject(Card,(Card,"deniedOperations"),"deniedOperations").
q1_childResult((Card,"deniedOperations"),(Card,ErrorMessage),"move") :- q1_childObject(Card,(Card,"deniedOperations"),"deniedOperations"); movingCardDenied(Card,ErrorMessage).
q1_resultField((Card,ErrorMessage),"errorMessage",ErrorMessage,"shortText") :- q1_childResult((Card,"deniedOperations"),(Card,ErrorMessage),"move").
% delete denied operations
q1_childResultCollection((Card,"deniedOperations"),"delete") :- q1_childObject(Card,(Card,"deniedOperations"),"deniedOperations").
q1_childResult((Card,"deniedOperations"),(Card,ErrorMessage),"delete") :- q1_childObject(Card,(Card,"deniedOperations"),"deniedOperations"); deletingCardDenied(Card,ErrorMessage).
q1_resultField((Card,ErrorMessage),"errorMessage",ErrorMessage,"shortText") :- q1_childResult((Card,"deniedOperations"),(Card,ErrorMessage),"delete").
% editField denied operations
q1_childResultCollection((Card,"deniedOperations"),"editField") :- q1_childObject(Card,(Card,"deniedOperations"),"deniedOperations").
q1_childResult((Card,"deniedOperations"),(Card,FieldName,ErrorMessage),"editField") :- q1_childObject(Card,(Card,"deniedOperations"),"deniedOperations"); editingFieldDenied(Card,FieldName,ErrorMessage).
q1_resultFields((Card,FieldName,ErrorMessage),"fieldName",FieldName,"shortText","errorMessage",ErrorMessage,"shortText") :- q1_childResult((Card,"deniedOperations"),(Card,FieldName,ErrorMessage),"editField").
% editContent denied operations
q1_childResultCollection((Card,"deniedOperations"),"editContent") :- q1_childObject(Card,(Card,"deniedOperations"),"deniedOperations").
q1_childResult((Card,"deniedOperations"),(Card,ErrorMessage),"editContent") :- q1_childObject(Card,(Card,"deniedOperations"),"deniedOperations"); editingContentDenied(Card,ErrorMessage).
q1_resultField((Card,ErrorMessage),"errorMessage",ErrorMessage,"shortText") :- q1_childResult((Card,"deniedOperations"),(Card,ErrorMessage),"editContent").
% labels
q1_childResultCollection(Card,"labels") :- q1_showCollection(Card,"labels").
q1_resultField(Card,"labels",Label,"stringList") :- q1_showCollection(Card,"labels"); label(Card,Label).