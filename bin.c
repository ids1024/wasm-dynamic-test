#include "lib.h"

void print_int(int);
void print_str(char*);

int main() {
    circle c = circle_new(5);
    print_str("Circumference: ");
    print_int(circle_circumference(c));
    print_str("Area: ");
    print_int(circle_area(c));
    return 0;
}
