'use server';
import { Calculate } from '@cyberismocom/data-handler/calculate';

export async function executeCardQuery(projectPath: string, key: string) {
  const calculate = new Calculate();
  await calculate.generate(projectPath);
  const cards = await calculate.runQuery(projectPath, 'card', {
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
