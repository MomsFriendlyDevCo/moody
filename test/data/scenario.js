module.exports = {
	actors: [
		{$: '$actors.daniel_bruhl', name: 'Daniel Bruhl'},
		{$: '$actors.chris_hemsworth', name: 'Chris Hemsworth'},
		{$: '$actors.olivia_wilde', name: 'Olivia Wilde'},
		{$: '$actors.natalie_portman', name: 'Natalie Portman'},
		{$: '$actors.tom_hiddleston', name: 'Tom Hiddleston'},
	],
	directors: [
		{$: '$directors.ron_howard', name: 'Ron Howard'},
		{$: '$directors.alan_taylor', name: 'Alan Taylor'},
	],
	movies: [
		{
			title: 'Rush',
			year: 2013,
			director: '$directors.ron_howard',
			actors: [
				'$actors.daniel_bruhl',
				'$actors.chris_hemsworth',
				'$actors.olivia_wilde',
			],
		},
		{
			title: 'Thor: The Dark World',
			year: 2013,
			director: '$directors.alan_taylor',
			actors: [
				'$actors.chris_hemsworth',
				'$actors.natalie_portman',
				'$actors.tom_hiddleston',
			],
		},
	],
};
