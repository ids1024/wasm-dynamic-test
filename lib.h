#pragma once

#define PI 3.14

typedef struct circle {
    int radius;
} circle;

circle circle_new(int radius);
int circle_circumference(circle c);
int circle_area(circle c);
