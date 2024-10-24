import Card from './card.js';

export default class PlayerDeck {
    constructor(decks) {
        this.cards = [];
        this.generateDeck(decks);
    }

    generateDeck(decks) {
        const suits = ['H', 'D', 'C', 'S'];
        const ranks = ['01', '02', '03', '04', '05', '06', '07', '08', '09', '10', '11', '12', '13'];
        let id = 0;
        for (let i = 0; i < Number(decks); i++) {
            for (let suit of suits) {
                for (let rank of ranks) {
                        let rVal = suit + rank;
                        this.cards.push(new Card(rVal, id));
                        id++
                }
            }
        }
    }
    
    shuffle() {
        this.cards.sort(() => Math.random() - 0.5);
    }

    draw() {
        return this.cards.pop();
    }

    addCard(card) {
        this.cards.push(card);
    }
}

