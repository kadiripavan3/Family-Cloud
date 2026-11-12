package app.homeport.api.library;

import app.homeport.api.common.ApiProblem;
import app.homeport.api.common.Codes;
import com.fasterxml.jackson.annotation.JsonCreator;
import com.fasterxml.jackson.annotation.JsonValue;

/** What a document is, for the chips above Files: IDs, Insurance, School, Receipts. */
public enum DocumentCategory {
    ID("ID"),
    INSURANCE("Insurance"),
    SCHOOL("School"),
    RECEIPT("Receipt"),
    RECIPE("Recipe"),
    MANUAL("Manual"),
    TAX("Tax"),
    HEALTH("Health"),
    HOME("Home"),
    OTHER("Document");

    private final String label;

    DocumentCategory(String label) {
        this.label = label;
    }

    /** The word for one of them, as a small label on a card: Recipe, Receipt. */
    public String label() {
        return label;
    }

    @JsonValue
    public String code() {
        return Codes.of(this);
    }

    @JsonCreator
    public static DocumentCategory of(String code) {
        return Codes.parse(
                DocumentCategory.class,
                code,
                () -> ApiProblem.badRequest("invalid_category", "That isn't one of the kinds of document."));
    }

    /** From a database column. */
    public static DocumentCategory read(String code) {
        return Codes.read(DocumentCategory.class, code);
    }
}
