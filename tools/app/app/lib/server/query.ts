'use server';
import { Calculate } from '@cyberismocom/data-handler/calculate';

export async function executeCardQuery(projectPath: string, key: string) {
  const calculate = new Calculate();
  await calculate.generate(projectPath);
  const card = await calculate.runQuery(projectPath, 'card', {
    cardKey: key,
  });
  if (card.error) {
    throw new Error(card.error);
  }
  if (card.results.length === 0) {
    throw new Error("Card query didn't return results");
  }
  if (card.results.length !== 1) {
    throw new Error('Card query returned multiple cards');
  }
  return card.results[0];
}
