// Naming fixture for the traced compiler (validate/event_presence.py): one method name, two overloads in one
// class and a third in another class. Each must trace under its own mangled name.

extern int fixture_sink(int value);

struct Counter {
    int value;
    int scale;
    int step(int amount);
    int step(int amount, int extra);
};

struct Other {
    int base;
    int step(int amount);
};

int Counter::step(int amount)
{
    int total = value + amount; // marker:decl-total
    return fixture_sink(total * scale);
}

int Counter::step(int amount, int extra)
{
    int total = value + amount * extra; // marker:decl-total2
    return fixture_sink(total + scale);
}

int Other::step(int amount)
{
    return fixture_sink(base - amount);
}

// Generated after its definition (it uses a template member, instantiated later), from the saved body: its local
// `sum` is rebuilt then, and must keep its own declaration line.
template <typename T>
struct Box {
    T item;
    T get() const { return item; }
};

int fixture_deferred(Box<int>* box, int amount)
{
    int sum = amount * 2; // marker:decl-sum
    int twice = fixture_sink(sum) + amount; // marker:decl-twice
    return box->get() + fixture_sink(twice) * sum;
}
