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
#include "guard.h"

namespace node_clingo
{
    namespace
    {
        using namespace Clingo::AST;

        // q(index) -- the guard literal appended to a rule's body so its head only fires in
        // the answer set where instance `index` was chosen. A fresh node, built here, never
        // shared with anything else -- needs no lock, same as batch.cc's (now deleted)
        // buildBridgeRule built its own fresh nodes.
        Node guardLiteral(int index)
        {
            Clingo::Location loc{"<guard>", "<guard>", 0, 0, 0, 0};
            Node numberTerm(Type::SymbolicTerm, loc, Clingo::Number(index));
            std::vector<Node> args{numberTerm};
            Node qTerm(Type::Function, loc, "q", args, 0);
            Node qAtom(Type::SymbolicAtom, qTerm);
            return Node(Type::Literal, loc, static_cast<int>(Sign::NoSign), qAtom);
        }

        // Rebuilds `rule` with `q(index)` appended to its body. The rule's own location and
        // head are carried over untouched, and every existing body literal is kept in
        // order; only a fresh Rule node wrapping them plus the new guard literal is
        // constructed, rather than mutating the parsed tree's Body attribute in place.
        Node appendGuard(const Node& rule, int index)
        {
            Clingo::Location loc = rule.get<Clingo::Location>(Attribute::Location);
            Node head = rule.get<Node>(Attribute::Head);
            std::vector<Node> body;
            for (Node lit : rule.get<NodeVector>(Attribute::Body))
            {
                body.push_back(lit);
            }
            body.push_back(guardLiteral(index));
            return Node(Type::Rule, loc, head, body);
        }
    } // namespace

    std::vector<Node> deep_copy_all(const std::vector<Node>& nodes)
    {
        std::vector<Node> out;
        out.reserve(nodes.size());
        for (const auto& node : nodes)
        {
            out.push_back(node.deep_copy());
        }
        return out;
    }

    void guard_rules_in_place(std::vector<Node>& nodes, int index)
    {
        for (auto& node : nodes)
        {
            if (node.type() == Type::Rule)
            {
                node = appendGuard(node, index);
            }
        }
    }

    std::vector<Node> guard_rules(const std::vector<Node>& nodes, int index)
    {
        std::vector<Node> out = deep_copy_all(nodes);
        guard_rules_in_place(out, index);
        return out;
    }
} // namespace node_clingo
