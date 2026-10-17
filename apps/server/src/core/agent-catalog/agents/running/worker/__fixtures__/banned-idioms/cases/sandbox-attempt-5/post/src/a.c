#include "a.h"
int shared_counter;
float gTable[4];
char *gName;
int gAligned;
int was_global;
/* comment: static int fake_static; */
const char *gMessage = "‚ ‚¢";
void reader_one(void) {
    shared_counter++;
    gTable[0] = 1.0f;
}
void reader_two(void)
{
    gTable[1] = shared_counter + gAligned;
    gName = 0;
}
void reader_three(void) { gAligned = shared_counter; }
static int extra;
