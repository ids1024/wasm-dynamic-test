#include "lib.h"

void print_int(int);
void print_str(char*);

int main() {
    circle c = circle_new(5);
    print_str("Circumference: ");
    print_int(circle_circumference(c));
    print_str("\nArea: ");
    print_int(circle_area(c));
    print_str("\n");
    return 0;
}
