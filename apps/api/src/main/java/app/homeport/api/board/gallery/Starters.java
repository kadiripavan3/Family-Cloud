package app.homeport.api.board.gallery;

import static app.homeport.api.board.gallery.Starter.starter;

import app.homeport.api.board.Template;
import java.util.EnumMap;
import java.util.Map;

/**
 * The ready-made content of every plain template: what "House manual" or "Moving out" starts as. Each one is
 * a few pages and checklists a family, a couple, a flat or a group of friends can use as they are and change
 * as they like. They are written here, in one place, so the words can be read and corrected together.
 *
 * <p>Nothing here asks for anything about anyone's health: the app keeps none of that.
 */
final class Starters {

    private static final Map<Template, Starter> ALL = new EnumMap<>(Template.class);

    private Starters() {}

    /** What a plain template starts as, or null for a template that does work (it starts as a board). */
    static Starter of(Template template) {
        return ALL.get(template);
    }

    static {
        // ---------- a family's ----------

        ALL.put(
                Template.PACKING_LIST,
                starter()
                        .list(
                                "Packing list",
                                "# Documents",
                                "Passports or ID cards",
                                "Tickets and booking numbers",
                                "Driving licence",
                                "Insurance card",
                                "# Each person",
                                "Clothes for every day, plus one spare set",
                                "Something warm and something for rain",
                                "Pyjamas",
                                "Toothbrush and wash bag",
                                "Comfortable shoes",
                                "# For the children",
                                "The one toy that can't stay at home",
                                "Snacks and water for the journey",
                                "Something to draw or read",
                                "# Before we lock the door",
                                "Chargers and a power bank",
                                "Windows shut, heating down",
                                "Bins out, fridge checked",
                                "Keys with the neighbour"));

        ALL.put(
                Template.HOUSE_MANUAL,
                starter()
                        .page("House manual", """
                    Everything someone needs to run this home when you're not there to ask.

                    Wi‑Fi
                    Network name:
                    The router is in:
                    If the internet stops: switch the router off, count to ten, switch it on.

                    Bins
                    General waste goes out on:
                    Recycling goes out on:
                    The bins live:

                    Heating and hot water
                    The boiler is in:
                    By day:        At night:
                    If there is no hot water:

                    Water, gas and electricity
                    The main water tap is:
                    The fuse box is:
                    The gas tap is:

                    Keys
                    Spare key is with:
                    The door that sticks:

                    Who to call
                    Plumber:
                    Electrician:
                    Landlord or building manager:
                    The neighbour who has a key:
                    """)
                        .list(
                                "When we go away",
                                "Windows and doors locked",
                                "Heating turned down",
                                "Plants watered",
                                "Bins out",
                                "Fridge emptied of what won't keep",
                                "A neighbour knows we're away"));

        ALL.put(
                Template.BABYSITTER_NOTES,
                starter()
                        .page("Babysitter notes", """
                    Thank you for looking after them. Here is how an evening goes.

                    Where we are tonight
                    Place:
                    Back by:
                    Our numbers:

                    Dinner
                    What they're having:
                    What they will say they're allowed, and aren't:

                    Bedtimes
                    Name:        In bed by:        Lights out by:
                    One story each. The night light stays on.

                    The routine
                    Bath or wash, teeth, pyjamas, story, lights out.
                    If someone can't sleep:

                    House rules
                    Screens off by:
                    Sweets:
                    The door is never opened to anyone we haven't told you about.

                    If you need help
                    Call us first, any time.
                    The neighbour who can come over:
                    In an emergency, call 112.
                    """)
                        .list(
                                "Before we leave",
                                "Show where the first-aid box and the torch are",
                                "Phone numbers written down, not only in a phone",
                                "Dinner ready or explained",
                                "Bedtimes agreed with the children in front of the sitter",
                                "Wi‑Fi shared",
                                "Spare key handed over"));

        ALL.put(
                Template.BIRTHDAY_PLANNER,
                starter()
                        .page("Birthday plan", """
                    Who it's for:
                    Turning:
                    The day and the time:
                    Where:

                    Guests
                    Invited:
                    Said yes:
                    Can't come:

                    The plan for the day
                    Arrive:
                    Games:
                    Food and cake:
                    Presents:
                    Home time:

                    Budget
                    Food and cake:
                    Decorations:
                    Party bags:
                    The present:

                    To keep this a surprise, tap the audience chip and hide it from the birthday person until the day.
                    """)
                        .list(
                                "Party prep",
                                "# Three weeks before",
                                "Pick the day and the place",
                                "Send the invitations",
                                "# The week before",
                                "Order or plan the cake",
                                "Buy decorations and party bags",
                                "Plan three games and one spare",
                                "# The day before",
                                "Wrap the presents",
                                "Blow up the balloons",
                                "Charge the camera",
                                "# On the day",
                                "Candles and matches",
                                "Someone takes photos",
                                "Write down who gave what")
                        .secretList(
                                "Gift ideas",
                                "Something they asked for",
                                "Something they need",
                                "Something to do together"));

        ALL.put(
                Template.SCHOOL_YEAR,
                starter()
                        .page("School year", """
                    One page per child works best. Copy this one for each of them.

                    School:
                    Class and teacher:
                    School office phone:
                    School starts at:        Ends at:

                    The week
                    Monday:
                    Tuesday:
                    Wednesday:
                    Thursday:
                    Friday:

                    After school
                    Clubs and the days they're on:
                    Who collects on which day:

                    Dates to remember
                    Parents' evenings:
                    Holidays:
                    Trips and the days money is due:

                    Sizes
                    Uniform:        Shoes:        Sports kit:
                    """)
                        .list(
                                "Forms to sign",
                                "Photo permission",
                                "Trip consent",
                                "After-school club",
                                "Lunch money or meal plan",
                                "Who may collect")
                        .list(
                                "Start of term",
                                "School bag and pencil case",
                                "Sports kit, named",
                                "Indoor shoes",
                                "Water bottle and lunch box",
                                "Name labels in everything"));

        ALL.put(Template.RECIPE_BOOK, starter().page("Recipe book", """
                    The dishes you make again and again, written down once.

                    One page per recipe keeps them easy to find. Start from the example page, "Sunday pancakes",
                    and copy its shape:

                    Serves:
                    Takes:
                    From: (whose recipe it is)

                    Ingredients
                    One per line, with how much.

                    Method
                    Short steps, in order.

                    Notes
                    What you changed last time, and whether it was better.
                    """).page("Sunday pancakes", """
                    Serves: 4
                    Takes: 25 minutes
                    From: the back of an old cookbook, improved

                    Ingredients
                    250 g plain flour
                    2 eggs
                    500 ml milk
                    A pinch of salt
                    Butter for the pan

                    Method
                    Whisk the flour, the eggs and half the milk until smooth.
                    Whisk in the rest of the milk and the salt. Let it stand for ten minutes.
                    Melt a little butter in a hot pan. Pour in a thin layer and tilt the pan.
                    Turn when the edges lift. The first one never works; eat it yourself.

                    Notes
                    Lemon and sugar, or jam. Double it when friends stay over.
                    """));

        ALL.put(
                Template.PET_CARE,
                starter()
                        .page("Pet care", """
                    Name:
                    Kind and breed:
                    Born:
                    Chip number:

                    Food
                    What:        How much:        When:
                    Never give:

                    Walks and play
                    Morning:
                    Evening:
                    Is fine off the lead:
                    Is scared of:

                    The vet
                    Practice:
                    Phone:
                    Next visit:

                    Papers
                    Insurance:
                    Pet passport is kept:

                    When we're away
                    Who looks after them:
                    Their number:
                    """)
                        .list(
                                "For the pet sitter",
                                "Food and treats for every day, plus two spare",
                                "Lead, collar and bags",
                                "Bed or blanket that smells of home",
                                "Favourite toy",
                                "The vet's number",
                                "Our numbers and when we're back",
                                "The feeding times, written down"));

        ALL.put(
                Template.HOME_INVENTORY,
                starter()
                        .page("Home inventory", """
                    What you own, room by room. It takes an evening and is worth it the day something breaks, is
                    stolen or has to be claimed for. Add a photo of each room, and of every receipt you still have.

                    For each thing, one line:
                    What it is · bought when · what it cost · serial number · where the receipt is

                    Living room

                    Kitchen

                    Bedrooms

                    Bathroom

                    Hallway, cellar and attic

                    Bikes, tools and what lives outside

                    Insurance
                    Insurer and policy number:
                    Covered up to:
                    Their claims phone number:
                    """)
                        .list(
                                "Worth a photo",
                                "Each room, from two corners",
                                "Serial numbers of the TV, laptops and phones",
                                "Bikes, with their frame numbers",
                                "Jewellery and watches",
                                "Receipts for anything over €200",
                                "The insurance policy itself"));

        ALL.put(
                Template.EMERGENCY_PLAN,
                starter()
                        .page("Emergency plan", """
                    Read it together once. Then everyone knows it's here.

                    Numbers
                    Emergencies: 112
                    Each of us:
                    A neighbour:
                    A relative who lives somewhere else:

                    Where we meet
                    If we have to leave the building:
                    If we can't get home:

                    In the house
                    The main water tap is:
                    The fuse box is:
                    The gas tap is:
                    The fire extinguisher or blanket is:
                    The torch and spare batteries are:

                    Papers
                    Copies of passports and IDs are kept:
                    Insurance policy numbers:

                    The children
                    School's phone number:
                    Who may collect them if we can't:
                    """)
                        .list(
                                "Grab bag",
                                "Torch and batteries",
                                "Phone charger and power bank",
                                "Water and something to eat",
                                "Copies of IDs and insurance papers",
                                "Some cash",
                                "Spare keys",
                                "A warm layer for each person",
                                "Pet food and a lead"));

        ALL.put(
                Template.MOVING_HOUSE,
                starter()
                        .list(
                                "Moving house",
                                "# Eight weeks before",
                                "Give notice, or agree the handover day",
                                "Get three quotes from movers, or book the van",
                                "Start a box of things to give away",
                                "# Four weeks before",
                                "Tell the school, employer and bank",
                                "Arrange electricity, water and internet at the new place",
                                "Collect boxes, tape and marker pens",
                                "Redirect the post",
                                "# Two weeks before",
                                "Pack what you won't need: books, winter things",
                                "Label every box with its room",
                                "Use up the freezer",
                                "# The last days",
                                "Read the meters and take a photo",
                                "Pack one box for the first night: kettle, mugs, bedding, chargers",
                                "Defrost the freezer",
                                "# Moving day",
                                "Walk through every room and cupboard",
                                "Hand over the keys",
                                "Photos of the empty rooms",
                                "# The first week",
                                "Change the address everywhere",
                                "Meet the neighbours",
                                "Find the bin days")
                        .page("New address", """
                    The new address, written out in full:

                    Moving day:
                    The movers, and their number:
                    Keys collected from:

                    Who has been told
                    Bank · employer · school · insurance · the tax office · subscriptions · friends and family

                    Meter readings on the day we left
                    Electricity:        Water:        Gas:

                    Meter readings on the day we arrived
                    Electricity:        Water:        Gas:
                    """));

        // ---------- a couple's ----------

        ALL.put(
                Template.MOVING_IN,
                starter()
                        .page("Moving in together", """
                    Two homes become one. Three lists make it painless: what each of you brings, what you need to
                    buy, and who needs to know.

                    What's whose
                    Write down the big things each of you brings, so nobody wonders later.
                    Yours:
                    Theirs:
                    Two of the same (keep the better one):

                    How we'll run it
                    Rent and bills:
                    Food:
                    Who does what, to begin with:
                    One thing each of you needs to feel at home:
                    """)
                        .list(
                                "To buy",
                                "A bed and a mattress you both like",
                                "Bedding in the right size",
                                "A second set of keys",
                                "Enough plates and glasses for guests",
                                "A toolbox",
                                "A doormat")
                        .list(
                                "Who to tell",
                                "Landlords, old and new",
                                "Banks",
                                "Employers",
                                "Insurance",
                                "Electricity and internet",
                                "The post office",
                                "Family and friends"));

        ALL.put(
                Template.WEDDING,
                starter()
                        .page("The wedding", """
                    The date:
                    The place:
                    How many guests:

                    Budget
                    The whole amount:
                    Place and food:
                    Clothes and rings:
                    Music and photos:
                    Flowers and decoration:
                    Everything nobody thinks of:

                    Guests
                    One line each: name · invited · answered · eats what · sits at which table

                    The seating plan
                    Table 1:
                    Table 2:
                    Table 3:

                    The day, hour by hour
                    """)
                        .list(
                                "Wedding to-dos",
                                "# A year before",
                                "Choose the date and the place",
                                "Agree the budget",
                                "Write the first guest list",
                                "# Six months before",
                                "Send the invitations",
                                "Book the music and the photographer",
                                "Choose the clothes",
                                "# One month before",
                                "Count the answers and chase the rest",
                                "Finish the seating plan",
                                "Collect the rings",
                                "# The week before",
                                "Confirm every booking",
                                "Hand the timetable to two people you trust",
                                "Pack for the days after"));

        ALL.put(
                Template.THEY_MENTIONED_IT,
                starter()
                        .secretList(
                                "They mentioned it",
                                "# Said in passing",
                                "Write it down the moment they say it, with the date",
                                "# Saw them look at it twice",
                                "The thing in the shop window",
                                "# Something to do together",
                                "A place they said they'd like to go"));

        ALL.put(
                Template.WEEKEND_AWAY,
                starter()
                        .list(
                                "A weekend away",
                                "# One bag each",
                                "Clothes for two days and one evening out",
                                "Something warm",
                                "Wash bag",
                                "Comfortable shoes",
                                "Book or headphones",
                                "# Between you",
                                "Tickets and the booking number",
                                "Chargers",
                                "A snack for the way there",
                                "# Before you go",
                                "Tell someone where you'll be",
                                "Water the plants",
                                "Phones on silent from Friday evening")
                        .page("The plan", """
                    Where:
                    Leaving on:        Back on:
                    Where we're staying, and the booking number:

                    Friday evening:
                    Saturday:
                    Sunday:

                    One thing each of us wants to do:
                    One thing we won't do: check work email.
                    """));

        ALL.put(
                Template.SOMEDAY,
                starter()
                        .list(
                                "Someday",
                                "# Places",
                                "A city neither of you has seen",
                                "Somewhere with no phone signal",
                                "The place one of you grew up",
                                "# Things to do",
                                "Learn something together from scratch",
                                "Cook a dish that takes all day",
                                "Stay up for a sunrise",
                                "# At home",
                                "The thing you keep saying you'll fix",
                                "A photo of the two of you on the wall"));

        // ---------- a flat's ----------

        ALL.put(Template.REPAIR_LOG, starter().page("Repair log", """
                    Everything that broke, what the landlord was told, and when. Add a photo to each one. If it ever
                    comes to an argument about the deposit, this page is the answer.

                    One entry per repair:

                    What is wrong:
                    Where:
                    Noticed on:
                    Reported to the landlord on:        How (email, phone, message):
                    What they said:
                    Fixed on:
                    Who paid:

                    The landlord
                    Name:
                    Phone and email:
                    For emergencies (water, heating, locks):
                    """));

        ALL.put(Template.HOUSE_RULES, starter().page("House rules", """
                    Agreed by everyone who lives here. A rule changes when everyone says yes to the change.

                    Quiet
                    Quiet after:        on weekdays, and after:        at weekends.

                    Guests
                    A guest for one night: tell the others.
                    A guest for longer than:        nights: ask the others first.

                    The kitchen
                    Dishes are washed the same day.
                    What is labelled is its owner's. What isn't is everyone's.

                    The bathroom
                    Mornings, who goes when:

                    Cleaning
                    The rota says whose week it is. Swaps are fine if both agree.

                    Money
                    Rent is due on:
                    Bills are split:
                    The kitty pays for: loo roll, cleaning things, oil, salt.

                    Agreed on (date), by:
                    """));

        ALL.put(Template.SOFA_FREE, starter().page("Is the sofa free?", """
                    Who has someone staying, and when. Write it here before you say yes to your guest.

                    One line per visit:
                    From · to · whose guest · where they sleep

                    How it works here
                    One guest at a time on the sofa.
                    The others are told at least:        days before.
                    A guest staying more than:        nights puts something in the kitty.
                    """));

        ALL.put(
                Template.HOUSE_PARTY,
                starter()
                        .page("House party", """
                    The date:
                    From:        Music down by:
                    How many people, at most:

                    Budget
                    From the kitty:
                    Each of us adds:
                    Drinks:        Food:        Everything else:

                    The playlist
                    Who is in charge of it:

                    The neighbours
                    Told on:        By:
                    """)
                        .list(
                                "Party to-dos",
                                "# Before",
                                "Tell the neighbours, with a phone number to call",
                                "Agree who invites how many",
                                "Put away what must not break",
                                "Ice, cups, bin bags",
                                "# On the night",
                                "One room stays closed",
                                "Music down at the agreed time",
                                "# The day after",
                                "Bottles out",
                                "Floors",
                                "Thank the neighbours"));

        ALL.put(
                Template.MOVING_OUT,
                starter()
                        .list(
                                "Moving out",
                                "# When you decide",
                                "Give notice in writing and keep a copy",
                                "Agree the last day with the others",
                                "Find out how the deposit comes back, and when",
                                "# The last month",
                                "Settle your share of every bill up to the last day",
                                "Take your name off the contracts you're on",
                                "Sell or give away what isn't coming with you",
                                "# The last week",
                                "Clean your room, and your share of the rest",
                                "Photos of your room, empty and clean, with the date",
                                "Read the meters together",
                                "# The last day",
                                "Hand back every key, and write down who took them",
                                "Leave a forwarding address",
                                "Take yourself off the door bell and the letter box")
                        .page("Leaving", """
                    Moving out on:
                    Notice given on:

                    The deposit
                    Paid:        Comes back by:        To this account:

                    The last bills
                    Rent paid up to:
                    Electricity, water, internet: your share up to the last day:

                    Keys handed back
                    How many:        To whom:        On:

                    Forwarding address:
                    """));

        // ---------- friends' ----------

        ALL.put(
                Template.WHO_BRINGS_WHAT,
                starter()
                        .list(
                                "Who brings what",
                                "# Food",
                                "A main dish",
                                "A second main dish, without meat",
                                "A salad",
                                "Bread",
                                "Something sweet",
                                "# Drinks",
                                "Something without alcohol",
                                "Wine or beer",
                                "Ice",
                                "# Everything else",
                                "Plates and cutlery",
                                "A speaker",
                                "Bin bags")
                        .page("How this list works", """
                    Put your name on a line by assigning it to yourself. One name per line means no third bowl of
                    hummus.

                    When and where:
                    How many of us:
                    """));

        ALL.put(Template.SPLIT_COSTS, starter().page("Split the costs", """
                    Write down who paid for what, as it happens. Settle up once, at the end.

                    One line per payment:
                    What · who paid · how much · who it was for (everyone, unless you say otherwise)

                    Payments

                    Settling up
                    Add up what each person paid. Work out each person's share. Whoever paid less than their share
                    pays the difference to whoever paid more. Start with the biggest gap; it takes the fewest
                    payments.

                    Paid back
                    One line per transfer: from · to · how much · on which day
                    """));

        ALL.put(
                Template.PRESENT_FROM_ALL,
                starter()
                        .page("A present from all of us", """
                    Before anything else: tap the audience chip and hide this page from the person it's for.

                    Who it's for:
                    The occasion and the date:

                    The idea:
                    What it costs:
                    Each of us puts in:

                    Who is buying it:
                    Who is wrapping it:
                    Who writes the card:
                    """)
                        .list("Who has paid in", "Add a line with each name and tick it when their share has arrived"));

        ALL.put(
                Template.GAMES_NIGHT,
                starter()
                        .page("Games night", """
                    Scores that outlast the evening.

                    One line per evening:
                    Date · where · the game · who won · who came last and has to host next time

                    The table so far
                    Name:        Wins:

                    House rules
                    The host chooses the first game.
                    Phones stay off the table.
                    The winner doesn't choose the next game.
                    """)
                        .list("Games to try", "One that takes ten minutes", "One with teams", "One nobody has played"));

        ALL.put(
                Template.BOOK_CLUB,
                starter()
                        .page("Book club", """
                    Whose pick it is, what we're reading, and what we thought.

                    Reading now:
                    Picked by:
                    We meet on:        At:

                    Whose turn to pick, in order:

                    What we've read
                    One line per book: title · picked by · when · what we gave it out of ten
                    """)
                        .list("To read next", "Add a book anyone suggests, with who suggested it"));
    }
}
