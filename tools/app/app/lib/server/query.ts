'use server';
import { Calculate } from '@cyberismocom/data-handler/calculate';
import { Project } from '@cyberismocom/data-handler/containers/project';

export async function executeCardQuery(projectPath: string, key: string) {
  const project = new Project(projectPath);
  const calculate = new Calculate(project);
  await calculate.generate();
  const cards = await calculate.runQuery('card', {
    cardKey: key,
  });
  if (cards.length === 0) {
    throw new Error("Card query didn't return results");
  }
  if (cards.length !== 1) {
    throw new Error('Card query returned multiple cards');
  }
  return cards[0];
}
