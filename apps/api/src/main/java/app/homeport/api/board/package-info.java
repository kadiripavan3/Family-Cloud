/**
 * Boards: templates that do work.
 *
 * <p>A board is a thing of kind BOARD (so it is shared, hidden, found and deleted like a page) with a
 * {@link app.homeport.api.board.Template} and a list of entries. The routes, the two tables, the API's
 * description and the plug-ins into Home are the same for every template and live in this package. What is
 * particular to one template is one class in {@code templates/}.
 *
 * <p><b>Adding a template</b> is:
 *
 * <ol>
 *   <li>its constant in {@link app.homeport.api.board.Template} (the gallery's card; many are there already,
 *       marked live and waiting for their rules);
 *   <li>one class that implements {@link app.homeport.api.board.BoardRules}: the records it stores and shows
 *       (named with the template's name in front, because the API's description lists them all side by
 *       side), what it takes, and above all what each person sees;
 *   <li>its tests: its rules, and its secrecy tried as two or three people;
 *   <li>its sample data, a {@code Seeder} of its own.
 * </ol>
 *
 * Nothing here changes: the engine finds the class, the gallery stops saying "coming with the next update",
 * and the template's records appear in the API's description.
 *
 * <p>What a template's rules are handed is a {@link app.homeport.api.board.Scene}: the board for one viewer
 * on one day. What they store is an {@link app.homeport.api.board.EntryRow}: a kind word, a small document,
 * and the few columns every template needs (who wrote it, who it is for, what it belongs under, a day, a
 * moment, a tick, a file, a number, a link's end). Entries are added and changed one at a time.
 */
package app.homeport.api.board;
