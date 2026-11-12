package app.homeport.api.money.sheet;

/** A formula that can't be read or can't be kept, with the reason as a sentence for the person who wrote it. */
public class FormulaProblem extends RuntimeException {

    public FormulaProblem(String sentence) {
        super(sentence);
    }
}
