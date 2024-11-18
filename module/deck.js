import { createCard } from './card.js';

export const generateDeck = (decks, type = 'default') => {
    const cards = [];
    const suits = ['H', 'D', 'C', 'S'];
    const ranks = ['01', '02', '03', '04', '05', '06', '07', '08', '09', '10', '11', '12', '13'];
    let id = 0;
    for (let i = 0; i < Number(decks); i++) {
        for (let suit of suits) {
            for (let rank of ranks) {
                if (type == 'default' && rank != '11') {
                    let rVal = suit + rank;
                    cards.push(createCard(rVal, id));
                    id++
                }
            }
        }
    }

    if (type == 'default') {
        const jokerCount = Number(decks * 2); // Assuming 2 Jokers per deck
        for (let i = 0; i < jokerCount; i++) {
            cards.push(createCard(`J0${i + 1}`, id));
            id++
        }
    }
    return cards;
};

export const shuffle = (cards) => {
    cards.sort(() => Math.random() - 0.5);
    return cards
};


