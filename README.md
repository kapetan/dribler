# dribler

A [reddit][reddit] bot for creating [/r/soccer][soccer] match threads. It fetches live soccer events from a given source and pushes the relevant updates to a reddit thread.

## Usage

The main component of the application is the server, which is used to manage event streams and associated match threads. Clone this repository and run node in the root of the project.

	$node .

In a browser navigate to the following URL.

	GET http://localhost:[PORT]/matches

The default development port is `10101`.

As an example using `goal.com` as lineup and live event provider, the URLs below can be used in the matches form.

* **Lineup** http://www.goal.com/en/match/argentina-vs-switzerland/1220127/lineups
* **Feed** http://www.goal.com/feed/matches/match-events?format=goal&matchId=1220127&edition=en

After the match has been created it is possible to make a reddit thread using the lineup and live stream data. Go to the `reddit` tab, fill out the required information and use the available actions to customize the thread (the reddit password will not be persisted, only used once to get a session token, which is stored in a cookie).

From now on whenever a relevant live event occurs the reddit thread is updated.

[reddit]: http://www.reddit.com
[soccer]: http://www.reddit.com/r/soccer
