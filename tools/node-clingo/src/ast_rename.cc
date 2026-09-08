/**
  Cyberismo
  Copyright © Cyberismo Ltd and contributors 2026
  This program is free software: you can redistribute it and/or modify it under
  the terms of the GNU Affero General Public License version 3 as published by
  the Free Software Foundation.
  This program is distributed in the hope that it will be useful, but WITHOUT
  ANY WARRANTY; without even the implied warranty of MERCHANTABILITY or FITNESS
  FOR A PARTICULAR PURPOSE. See the GNU Affero General Public License for more
  details. You should have received a copy of the GNU Affero General Public
  License along with this program. If not, see <https://www.gnu.org/licenses/>.
*/
#include "ast_rename.h"

namespace node_clingo
{
    namespace
    {
        using namespace Clingo::AST;

        /**
         * Predicate signatures of a term appearing directly as a symbolic atom's own term.
         * A plain call is a Function node; a bare 0-arity constant
         * (e.g. `selectAll`) parses as a SymbolicTerm holding a Function symbol rather
         * than a Function node; a Pool (e.g. `(p(X);q(X))`) stands for each of its
         * alternatives.
         */
        void collectTermSignatures(const Node& term, std::set<Signature>& sigs)
        {
            switch (term.type())
            {
                case Type::Function: {
                    auto arity = static_cast<int>(term.get<NodeVector>(Attribute::Arguments).size());
                    sigs.emplace(term.get<char const*>(Attribute::Name), arity);
                    break;
                }
                case Type::SymbolicTerm: {
                    Clingo::Symbol sym = term.get<Clingo::Symbol>(Attribute::Symbol);
                    if (sym.type() == Clingo::SymbolType::Function)
                    {
                        sigs.emplace(sym.name(), static_cast<int>(sym.arguments().size()));
                    }
                    break;
                }
                case Type::Pool: {
                    for (Node arg : term.get<NodeVector>(Attribute::Arguments))
                    {
                        collectTermSignatures(arg, sigs);
                    }
                    break;
                }
                default:
                    break;
            }
        }

        /**
         * Signatures defined by a single rule head. A plain literal head contributes its
         * symbolic atom; Disjunction/Aggregate elements are ConditionalLiterals, so this
         * recurses on each element's own literal (its condition is a body, not a
         * definition); HeadAggregateElement wraps its condition in another
         * ConditionalLiteral, one level deeper. A BooleanConstant head (a constraint)
         * defines nothing.
         */
        void collectHeadSignatures(const Node& head, std::set<Signature>& sigs)
        {
            switch (head.type())
            {
                case Type::Literal: {
                    Node atom = head.get<Node>(Attribute::Atom);
                    if (atom.type() == Type::SymbolicAtom)
                    {
                        collectTermSignatures(atom.get<Node>(Attribute::Symbol), sigs);
                    }
                    break;
                }
                case Type::Disjunction:
                case Type::Aggregate: {
                    for (Node element : head.get<NodeVector>(Attribute::Elements))
                    {
                        collectHeadSignatures(element.get<Node>(Attribute::Literal), sigs);
                    }
                    break;
                }
                case Type::HeadAggregate: {
                    for (Node element : head.get<NodeVector>(Attribute::Elements))
                    {
                        Node condition = element.get<Node>(Attribute::Condition);
                        collectHeadSignatures(condition.get<Node>(Attribute::Literal), sigs);
                    }
                    break;
                }
                default:
                    break;
            }
        }

        /**
         * Renames `term` in place -- and, for a Pool, each of its alternatives -- when it
         * matches a defined signature. Never descends into a Function's own arguments:
         * those are data, not a predicate use, however deeply they nest.
         */
        void renameTerm(Node term, const std::set<Signature>& sigs, const std::string& prefix)
        {
            switch (term.type())
            {
                case Type::Function: {
                    std::string name = term.get<char const*>(Attribute::Name);
                    auto arity = static_cast<int>(term.get<NodeVector>(Attribute::Arguments).size());
                    if (sigs.count({name, arity}))
                    {
                        std::string renamed = prefix + name;
                        term.set(Attribute::Name, NodeValue{renamed.c_str()});
                    }
                    break;
                }
                case Type::SymbolicTerm: {
                    Clingo::Symbol sym = term.get<Clingo::Symbol>(Attribute::Symbol);
                    if (sym.type() == Clingo::SymbolType::Function)
                    {
                        auto arity = static_cast<int>(sym.arguments().size());
                        if (sigs.count({sym.name(), arity}))
                        {
                            std::string renamed = prefix + sym.name();
                            Clingo::Symbol renamedSym =
                                Clingo::Function(renamed.c_str(), sym.arguments(), sym.is_positive());
                            term.set(Attribute::Symbol, NodeValue{renamedSym});
                        }
                    }
                    break;
                }
                case Type::Pool: {
                    for (Node arg : term.get<NodeVector>(Attribute::Arguments))
                    {
                        renameTerm(arg, sigs, prefix);
                    }
                    break;
                }
                default:
                    break;
            }
        }

        /**
         * Renames every SymbolicAtom matching a defined signature, every #show term's own
         * Function (unconditionally -- see rename_predicates), and every #show signature
         * matching a defined signature, wherever they occur in `node`; recurses
         * structurally into every other node so a match nested in a body, an aggregate, a
         * conditional literal, or a disjunction is still found. A Comparison's or Guard's
         * terms are never predicate uses and so are never visited specially -- they fall
         * through to plain structural recursion, same as clingo's own AST shape implies no
         * atom lives there.
         */
        void renameNode(Node node, const std::set<Signature>& sigs, const std::string& prefix)
        {
            switch (node.type())
            {
                case Type::SymbolicAtom:
                    renameTerm(node.get<Node>(Attribute::Symbol), sigs, prefix);
                    return;
                case Type::ShowTerm: {
                    // A #show term's own Function is prefixed unconditionally -- it names
                    // the shown output, not a claim that this program derives it -- matching
                    // qtools/lpast.py's Renamer.visit_ShowTerm called with show_prefix ==
                    // prefix, which is how qtools/renaming.py's build_instance always calls
                    // it. An otherwise-undefined #show'd predicate still needs its own
                    // output name prefixed, or it collides across instances like any other
                    // unrenamed shared predicate would.
                    Node term = node.get<Node>(Attribute::Term);
                    if (term.type() == Type::Function)
                    {
                        std::string name = term.get<char const*>(Attribute::Name);
                        term.set(Attribute::Name, NodeValue{(prefix + name).c_str()});
                    }
                    for (Node lit : node.get<NodeVector>(Attribute::Body))
                    {
                        renameNode(lit, sigs, prefix);
                    }
                    return;
                }
                case Type::ShowSignature: {
                    std::string name = node.get<char const*>(Attribute::Name);
                    int arity = node.get<int>(Attribute::Arity);
                    if (sigs.count({name, arity}))
                    {
                        std::string renamed = prefix + name;
                        node.set(Attribute::Name, NodeValue{renamed.c_str()});
                    }
                    return;
                }
                default:
                    break;
            }
            // Generic structural descent: every attribute that holds a Node, an optional
            // Node, or a Node array is walked the same way, wherever it occurs.
            node.visit_attribute([&](Attribute /*attr*/, NodeValue value) {
                if (value.is<Node>())
                {
                    renameNode(value.get<Node>(), sigs, prefix);
                }
                else if (value.is<Clingo::Optional<Node>>())
                {
                    Node* child = value.get<Clingo::Optional<Node>>().get();
                    if (child != nullptr)
                    {
                        renameNode(*child, sigs, prefix);
                    }
                }
                else if (value.is<NodeVector>())
                {
                    for (Node child : value.get<NodeVector>())
                    {
                        renameNode(child, sigs, prefix);
                    }
                }
            });
        }
    } // namespace

    std::set<Signature> head_signatures(const std::vector<Node>& nodes)
    {
        std::set<Signature> sigs;
        for (const auto& node : nodes)
        {
            if (node.type() == Type::Rule)
            {
                collectHeadSignatures(node.get<Node>(Attribute::Head), sigs);
            }
        }
        return sigs;
    }

    std::vector<Node> rename_predicates(
        const std::vector<Node>& nodes,
        const std::set<Signature>& sigs,
        const std::string& prefix)
    {
        std::vector<Node> out;
        out.reserve(nodes.size());
        for (const auto& node : nodes)
        {
            Node copy = node.deep_copy();
            renameNode(copy, sigs, prefix);
            out.push_back(std::move(copy));
        }
        return out;
    }
} // namespace node_clingo
