/* Event-presence fixture for the traced compiler (validate/event_presence.py). Each construct below exists to make
 * one trace point fire; the markers name the lines the checks look for. Do not reformat. */

typedef struct Pair {
    int a;
    int b;
    float scale;
} Pair;

extern int fixture_extern(char* buffer, int value);

static inline int fixture_helper(int x) { return x * 3 + 1; }

int fixture_main(Pair* pair, int seed)
{
    int count; /* marker:decl-count */
    int copy; /* marker:decl-copy */
    float scaled; /* marker:decl-scaled */
    char buf[16]; /* marker:decl-buf */

    count = seed + fixture_helper(seed); /* marker:inline-helper */
    copy = count;
    if (pair->a + pair->b > copy) {
        count += pair->a + pair->b; /* marker:cse */
    }
    scaled = pair->scale * (float)count;
    buf[0] = (char)copy;
    count += fixture_extern(buf, count); /* marker:call-extern */
    return count + copy + (int)scaled;
}

int fixture_forward(char* buffer, int value)
{
    return fixture_extern(buffer, value); /* marker:coalesce */
}
