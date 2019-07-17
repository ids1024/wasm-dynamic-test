#include "lib.h"

circle circle_new(int radius) {
    circle c;
    c.radius = radius;
    return c;
}

int circle_circumference(circle c) {
    return 2 * PI * c.radius;
}

int circle_area(circle c) {
    return PI * c.radius * c.radius;
}
