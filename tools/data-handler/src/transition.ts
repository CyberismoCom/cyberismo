// node
import { EventEmitter } from 'node:events';
import { join } from 'node:path';
import { writeFileSync } from 'node:fs';

// ismo
import { Calculate } from './calculate.js';
import { card, workflowState } from './interfaces/project-interfaces.js';
import { requestStatus } from './interfaces/request-status-interfaces.js';
import { Project } from './containers/project.js';
import { formatJson } from './utils/json.js';

export class Transition extends EventEmitter {

    static project: Project;
    private calculateCmd: Calculate;

    constructor(calculateCmd: Calculate) {
        super();
        this.calculateCmd = calculateCmd;
        this.addListener(
            'transitioned',
            this.calculateCmd.handleCardChanged.bind(this.calculateCmd));
    }

    // Sets card state
    private async setCardState(card: card, state: string) {
        if (card.metadata) {
            card.metadata.workflowState = state
            writeFileSync(join(card.path, Project.cardMetadataFile), formatJson(card.metadata));
        }
    }

    /**
     * Transitions a card from its current state to a new state.
     * @param {string} projectPath path to a project
     * @param {string} cardKey cardkey
     * @param {string} transition which transition to do
     * @returns request status
     *       statusCode 200 when operation succeeded
     *  <br> statusCode 400 when card was not found from the project
     *  <br> statusCode 400 when state is missing from workflow
     *  <br> statusCode 400 when state cannot be moved to
     *  <br> statusCode 500 when internal issue occurred (missing cardtype, or workflow)
     */
    public async cardTransition(projectPath: string, cardKey: string, transition: workflowState): Promise<requestStatus> {
        Transition.project = new Project(projectPath);

        // Card details
        const details = await Transition.project.cardDetailsById(cardKey, { metadata: true });
        if (!details || !details.metadata) {
            return { statusCode: 400, message: `Card ${cardKey} does not exist in the project` };
        }

        // Cardtype
        const cardtype = await Transition.project.cardType(details.metadata?.cardtype);
        if (cardtype === undefined) {
            return {
                statusCode: 500,
                message: `Card's cardtype '${details.metadata?.cardtype}' does not exist in the project`
            };
        }

        // Workflow
        const workflow = await Transition.project.workflow(cardtype.workflow);
        if (workflow === undefined) {
            return {
                statusCode: 500,
                message: `Card's workflow '${cardtype.workflow}' does not exist in the project`
            };
        }

        // Check that the state transition can be made "from".
        const foundFrom = workflow.transitions
            .find(item =>
            (details.metadata && item.fromState.includes(details.metadata?.workflowState)
                || item.fromState.includes('*')));
        if (!foundFrom) {
            return {
                statusCode: 400,
                message: `Card's workflow '${cardtype.workflow}' does not contain transition from card's current state '${details.metadata?.workflowState}'`
            };
        }

        // Check that the state transition can be made "to".
        const found = workflow.transitions.find(item => item.name === transition.name);
        if (!found) {
            const transitionNames = workflow.transitions.map(item => item.name);
            return {
                statusCode: 400,
                message: `Card's workflow '${cardtype.workflow}' does not contain state transition '${transition.name}'.
                          \nThe available transitions are: ${transitionNames.join(', ')}`
            };
        }

        if (!(found.fromState.includes(details.metadata?.workflowState) || found.fromState.includes('*'))) {
            return {
                statusCode: 400,
                message: `Card's workflow '${cardtype.workflow}' does not contain state transition from state '${details.metadata?.workflowState}' for '${transition.name}`
            };
        }

        // Write new state and re-calculate.
        await this.setCardState(details, found.toState);
        this.emit('transitioned', details);
        return { statusCode: 200 };
    }
}