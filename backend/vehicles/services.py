from vehicles.models import NewCar, UsedCar


def create_new_car(owner, data):
    return NewCar.objects.create(owner=owner, **data)


def update_new_car(car, data):
    for field, value in data.items():
        setattr(car, field, value)
    car.save()
    return car


def delete_new_car(car):
    car.delete()


def create_used_car(owner, data):
    return UsedCar.objects.create(owner=owner, **data)


def update_used_car(car, data):
    for field, value in data.items():
        setattr(car, field, value)
    car.save()
    return car


def delete_used_car(car):
    car.delete()
