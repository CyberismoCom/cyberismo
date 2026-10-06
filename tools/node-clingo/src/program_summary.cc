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
#include "program_summary.h"

#include <algorithm>

#include <clingo.hh>

#include "solve_result_cache.h" // ClingoLogMessage, ClingoSolveException

namespace node_clingo
{
    namespace
    {
        using Clingo::AST::Attribute;
        using Clingo::AST::Node;
        using Clingo::AST::NodeVector;
        using Clingo::AST::Type;

        std::string signature(bool negative, char const* name, size_t arity)
        {
            return (negative ? "-" : "") + std::string(name) + "/" + std::to_string(arity);
        }

        void term_sigs(const Node& term, bool negative, std::set<std::string>& out)
        {
            switch (term.type())
            {
                case Type::Function:
                    out.insert(signature(
                        negative,
                        term.get<char const*>(Attribute::Name),
                        term.get<NodeVector>(Attribute::Arguments).size()));
                    break;
                case Type::SymbolicTerm: {
                    // Diverges from lpast, which ignores the sign.
                    auto symbol = term.get<Clingo::Symbol>(Attribute::Symbol);
                    if (symbol.type() == Clingo::SymbolType::Function)
                    {
                        out.insert(
                            signature(negative || symbol.is_negative(), symbol.name(), symbol.arguments().size()));
                    }
                    break;
                }
                case Type::Pool:
                    for (Node argument : term.get<NodeVector>(Attribute::Arguments))
                    {
                        term_sigs(argument, negative, out);
                    }
                    break;
                case Type::UnaryOperation:
                    // Classical negation. Diverges from lpast, which drops the atom.
                    if (static_cast<Clingo::AST::UnaryOperator>(term.get<int>(Attribute::OperatorType)) ==
                        Clingo::AST::UnaryOperator::Minus)
                    {
                        term_sigs(term.get<Node>(Attribute::Argument), true, out);
                    }
                    break;
                default:
                    break;
            }
        }

        void body(const NodeVector& elements, ProgramSummary& out);

        void body_literal(const Node& literal, ProgramSummary& out)
        {
            Node atom = literal.get<Node>(Attribute::Atom);
            switch (atom.type())
            {
                case Type::SymbolicAtom:
                    term_sigs(atom.get<Node>(Attribute::Symbol), false, out.bodies);
                    break;
                case Type::BodyAggregate:
                    // Aggregate terms are ignored; only the conditions are read.
                    for (Node element : atom.get<NodeVector>(Attribute::Elements))
                    {
                        body(element.get<NodeVector>(Attribute::Condition), out);
                    }
                    break;
                case Type::Aggregate:
                    body(atom.get<NodeVector>(Attribute::Elements), out);
                    break;
                default:
                    break;
            }
        }

        void body(const NodeVector& elements, ProgramSummary& out)
        {
            for (Node element : elements)
            {
                if (element.type() == Type::Literal)
                {
                    body_literal(element, out);
                }
                else if (element.type() == Type::ConditionalLiteral)
                {
                    body_literal(element.get<Node>(Attribute::Literal), out);
                    body(element.get<NodeVector>(Attribute::Condition), out);
                }
            }
        }

        void head_literal(const Node& literal, ProgramSummary& out)
        {
            Node atom = literal.get<Node>(Attribute::Atom);
            if (atom.type() != Type::SymbolicAtom)
            {
                return;
            }
            // `not k :- l.` means `:- l, k.`: it reads k and derives nothing.
            // Diverges from lpast, which counts k as a head.
            bool derives =
                static_cast<Clingo::AST::Sign>(literal.get<int>(Attribute::Sign)) == Clingo::AST::Sign::NoSign;
            term_sigs(atom.get<Node>(Attribute::Symbol), false, derives ? out.heads : out.bodies);
        }

        void head(const Node& head, ProgramSummary& out)
        {
            switch (head.type())
            {
                case Type::Literal:
                    head_literal(head, out);
                    break;
                case Type::Aggregate:
                case Type::Disjunction:
                    for (Node element : head.get<NodeVector>(Attribute::Elements))
                    {
                        head_literal(element.get<Node>(Attribute::Literal), out);
                        body(element.get<NodeVector>(Attribute::Condition), out);
                    }
                    break;
                case Type::HeadAggregate:
                    for (Node element : head.get<NodeVector>(Attribute::Elements))
                    {
                        Node condition = element.get<Node>(Attribute::Condition);
                        head_literal(condition.get<Node>(Attribute::Literal), out);
                        body(condition.get<NodeVector>(Attribute::Condition), out);
                    }
                    break;
                default:
                    break;
            }
        }

        void statement(const Node& node, ProgramSummary& out)
        {
            switch (node.type())
            {
                case Type::Rule:
                    head(node.get<Node>(Attribute::Head), out);
                    body(node.get<NodeVector>(Attribute::Body), out);
                    break;
                case Type::ShowSignature:
                    out.bodies.insert(signature(
                        !node.get<int>(Attribute::Positive),
                        node.get<char const*>(Attribute::Name),
                        node.get<int>(Attribute::Arity)));
                    break;
                // Only the body is read. The rest diverge from lpast, which
                // ignores them: a weak constraint shifts the optimum, and an
                // external derives nothing since no external is ever assigned.
                case Type::ShowTerm:
                case Type::Minimize:
                case Type::External:
                case Type::Heuristic:
                case Type::Edge:
                case Type::ProjectAtom:
                    body(node.get<NodeVector>(Attribute::Body), out);
                    break;
                default:
                    break;
            }
        }
    } // namespace

    ProgramSummary parse_summary(const std::string& content)
    {
        std::vector<ClingoLogMessage> logMessages;
        Clingo::Logger logger = [&logMessages](Clingo::WarningCode code, char const* message) {
            logMessages.push_back({code, code == Clingo::WarningCode::RuntimeError, message});
        };

        ProgramSummary summary;
        try
        {
            Clingo::AST::parse_string(
                content.c_str(),
                [&summary](Clingo::AST::Node node) { statement(node, summary); },
                logger,
                MAX_CLINGO_LOG_MESSAGES);
        }
        catch (const std::exception& e)
        {
            bool hasError = std::any_of(
                logMessages.begin(), logMessages.end(), [](const ClingoLogMessage& msg) { return msg.isError; });
            if (!hasError)
            {
                logMessages.push_back({Clingo::WarningCode::RuntimeError, true, e.what()});
            }
            throw ClingoSolveException(e.what(), std::move(logMessages));
        }
        return summary;
    }
} // namespace node_clingo
