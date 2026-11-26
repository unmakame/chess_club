#include <algorithm>
#include <cstdint>
#include <iostream>
#include <unordered_set>
#include <vector>

int main() {
    int count;
    if (!(std::cin >> count) || count < 2 || count > 32) return 1;

    std::vector<std::int64_t> seats;
    std::unordered_set<std::int64_t> players;
    for (int i = 0; i < count; ++i) {
        std::int64_t player;
        if (!(std::cin >> player) || player <= 0 || !players.insert(player).second) {
            return 1;
        }
        seats.push_back(player);
    }
    if (count % 2 != 0) seats.push_back(0);

    const auto rounds = seats.size() - 1;
    for (std::size_t round = 0; round < rounds; ++round) {
        for (std::size_t pair = 0; pair < seats.size() / 2; ++pair) {
            auto white = seats[pair];
            auto black = seats[rounds - pair];
            if (white == 0 || black == 0) continue;
            if ((pair == 0 ? round : pair) % 2 != 0) std::swap(white, black);
            std::cout << round + 1 << ' ' << white << ' ' << black << '\n';
        }
        std::rotate(seats.begin() + 1, seats.end() - 1, seats.end());
    }
}
